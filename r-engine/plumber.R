# =====================================================================
# scCloud v2 — Plumber API 入口
#
# 设计原则:
#   1. 所有计算逻辑来自旧系统原始脚本 (data_processing.R / data_summary.R / data_plot.R)
#   2. 本文件只做 REST 包装: 接收参数 → 调用原始函数 → 返回 JSON/图片
#   3. 进度报告通过 Redis PUBLISH 推送到 FastAPI → WebSocket → 前端
#   4. 任何计算逻辑的修改必须在原始脚本中完成
#
# 来源映射:
#   /qc         → data_processing.R::get_mito(), totalMT_result()
#   /normalize  → data_summary.R::RunSCT()
#   /reduce     → data_plot.R::my_distPlot3()
#   /cluster    → data_summary.R::runHarmony(), RenameIdents2()
#   /markers    → data_summary.R::my_diffTable(), my_diffTable2()
#   /enrich     → data_plot.R::my_distPlot10()
#   /plot       → data_plot.R::my_distPlot1() ~ my_distPlot11()
#   /annotate   → data_summary.R::RunAnno()
#   /convert    → SeuratDisk (新增功能)
# =====================================================================

library(plumber)
library(jsonlite)

# 加载进度报告工具 (唯一的新增基础设施代码)
source("R/utils.R")

# 加载旧系统原始计算脚本 — 零修改
source("R/data_processing.R")
source("R/data_summary.R")
source("R/data_plot.R")

# 自定义错误处理器: 将 stop() 的原始消息透传给调用方
#* @plumber
function(pr) {
  pr$setErrorHandler(function(req, res, err) {
    res$status <- 500L
    msg <- conditionMessage(err)
    list(error = msg)
  })
}


# =====================================================================
# 文件命名辅助函数
# 双命名策略：归档名（含项目名+时间戳+步骤）+ 管道链名（固定名）
# =====================================================================

#' 生成带项目名+时间戳+步骤的归档文件名
#' @param project_path 项目目录路径（basename 用作项目名）
#' @param step_num     步骤编号（保留参数兼容性，但不再写入文件名）
#' @param step_name    步骤名 (如 "qc", "normalize", ...)
#' @param suffix       后缀描述 (如 "filtered", "SCT", ...)
#' @param ext          文件扩展名 (如 "rds", "png", ...)
#' @return 文件名字符串，如 "MyProject_20260422113900.qc_filtered.rds"
make_output_name <- function(project_path, step_num, step_name, suffix, ext) {
  proj <- basename(project_path)
  ts <- format(Sys.time(), "%Y%m%d%H%M%S", tz = "Asia/Shanghai")
  paste0(proj, "_", step_name, "_", ts, "_", suffix, ".", ext)
}

#' 保存文件并同时创建管道链名副本
#' @param archive_path 归档路径（带时间戳的完整路径）
#' @param canonical_path 管道链路径（固定名称，供下一步读取）
#' @param object 要保存的 R 对象（NULL 表示文件已存在，只需复制）
save_with_canonical <- function(archive_path, canonical_path, object = NULL) {
  if (!is.null(object)) {
    saveRDS(object, archive_path)
  }
  file.copy(archive_path, canonical_path, overwrite = TRUE)
}


#* @apiTitle scCloud v2 R 计算引擎
#* @apiDescription 无状态 REST API，封装 Seurat/Bioconductor 分析流程

# ======================================================================
# 健康检查
# ======================================================================

#* 健康检查
#* @get /health
function() {
  list(
    status = "ok",
    r_version = R.version.string,
    seurat = as.character(packageVersion("Seurat"))
  )
}


# ======================================================================
# 基因列表查询（轻量端点，供前端自动补全）
# ======================================================================

#* 获取 Seurat 对象中所有可用基因名称
#* @post /genes
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) {
    stop("请先运行聚类步骤")
  }

  pro <- readRDS(input_path)
  genes <- sort(rownames(GetAssayData(pro, assay = "SCT", layer = "data")))

  list(status = "success", genes = genes)
}


# ======================================================================
# 1. 质控 (QC)
#    调用: data_processing.R::get_mito(), totalMT_result(), get_umi_gene() 等
# ======================================================================

#* 运行质控分析
#* @post /qc
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  # 前端参数嵌套在 body$params 内部 (由 FastAPI 路由封装)
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载数据...")

  # 优先使用前端传入的 rds_file_path（上传后直接指定的路径）
  rds_file_path <- params$rds_file_path
  if (!is.null(rds_file_path) && nchar(rds_file_path) > 0 && file.exists(rds_file_path)) {
    exp <- readRDS(rds_file_path)
  } else {
    # 退而求其次: 扫描项目目录
    rds_files <- list.files(project_path, pattern = "\\.rds$", full.names = TRUE)
    if (length(rds_files) == 0) stop("项目目录中未找到 .rds 文件，请先上传数据文件")
    exp <- readRDS(rds_files[1])
  }

  report(20, "计算线粒体比例...")

  # 添加线粒体百分比
  if (!"percent.mt" %in% colnames(exp@meta.data)) {
    exp[["percent.mt"]] <- PercentageFeatureSet(exp, pattern = "^MT-|^mt-")
  }

  report(35, "生成 QC 统计...")

  # 调用原始函数
  totalMT <- totalMT_result(exp)
  umiGene <- umiGene_result(exp)

  # ---- 生成样本相关性散点图 (my_distPlot1) ----
  report(40, "生成样本相关性图...")
  corr_archive <- make_output_name(project_path, "1", "qc", "correlation", "png")
  corr_plot_path <- file.path(project_path, corr_archive)
  png(corr_plot_path, width = 1400, height = 600, res = 150)
  print(my_distPlot1(exp))
  dev.off()

  report(60, "过滤细胞...")

  # 过滤参数 (来自前端，已在上方从 body$params 解包)
  min_features <- params$min_features %||% 200
  max_features <- params$max_features %||% 5000
  max_mt_ratio <- params$max_mt_ratio %||% 20
  umi_min_pct  <- params$umi_min_pct %||% 0
  umi_max_pct  <- params$umi_max_pct %||% 1

  # 计算 nUMI(nCount_RNA) 的分位数截断点
  umi_lower_bound <- quantile(exp$nCount_RNA, probs = umi_min_pct, na.rm = TRUE)
  umi_upper_bound <- quantile(exp$nCount_RNA, probs = umi_max_pct, na.rm = TRUE)

  pro <- subset(
    exp,
    subset = nFeature_RNA >= min_features &
             nFeature_RNA <= max_features &
             percent.mt <= max_mt_ratio &
             nCount_RNA >= umi_lower_bound &
             nCount_RNA <= umi_upper_bound
  )

  # 过滤后统计
  totalMT1 <- totalMT1_result(pro)
  umiGene1 <- umiGene1_result(pro)

  # ---- 生成过滤前后 VlnPlot 对比 (my_distPlot2) ----
  report(70, "生成质控小提琴图...")
  vln_archive <- make_output_name(project_path, "1", "qc", "violin", "png")
  vln_plot_path <- file.path(project_path, vln_archive)
  png(vln_plot_path, width = 1400, height = 1000, res = 150)
  print(my_distPlot2(exp, pro))
  dev.off()

  report(85, "保存结果...")

  # 双命名：归档名 + 管道链名
  rds_archive <- make_output_name(project_path, "1", "qc", "filtered", "rds")
  archive_path <- file.path(project_path, rds_archive)
  canonical_path <- file.path(project_path, "seurat_qc.rds")
  save_with_canonical(archive_path, canonical_path, pro)

  # 保存 QC 统计 CSV（归档名）
  mito_csv_archive <- make_output_name(project_path, "1", "qc", "mito_stats", "csv")
  mito_csv_path <- file.path(project_path, mito_csv_archive)
  write.csv(rbind(
    data.frame(stage = "before", totalMT),
    data.frame(stage = "after", totalMT1)
  ), mito_csv_path, row.names = FALSE)

  umi_csv_archive <- make_output_name(project_path, "1", "qc", "umi_gene_stats", "csv")
  umi_csv_path <- file.path(project_path, umi_csv_archive)
  write.csv(rbind(
    data.frame(stage = "before", umiGene),
    data.frame(stage = "after", umiGene1)
  ), umi_csv_path, row.names = FALSE)

  report(100, "质控完成")

  list(
    status = "success",
    result_path = archive_path,
    stats = list(
      total_cells_before = ncol(exp),
      total_cells_after = ncol(pro),
      total_genes = nrow(pro),
      samples = length(unique(pro@meta.data$Sample))
    ),
    mito_table_before = totalMT,
    mito_table_after = totalMT1,
    umi_gene_before = umiGene,
    umi_gene_after = umiGene1,
    corr_plot_path = corr_plot_path,
    violin_plot_path = vln_plot_path,
    mito_csv_path = mito_csv_path,
    umi_csv_path = umi_csv_path
  )
}


# ======================================================================
# 2. 标准化
#    调用: data_summary.R::RunSCT()
# ======================================================================

#* SCTransform 标准化
#* @post /normalize
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载 QC 后数据...")

  input_path <- file.path(project_path, "seurat_qc.rds")
  if (!file.exists(input_path)) stop("请先运行质控步骤")
  pro <- readRDS(input_path)

  report(20, "运行 SCTransform 标准化...")

  # 调用原始函数 — data_summary.R::RunSCT()
  pro <- RunSCT(pro)

  report(80, "保存标准化结果...")

  # 双命名：归档名 + 管道链名
  rds_archive <- make_output_name(project_path, "2", "normalize", "SCT", "rds")
  archive_path <- file.path(project_path, rds_archive)
  canonical_path <- file.path(project_path, "seurat_normalized.rds")
  save_with_canonical(archive_path, canonical_path, pro)

  report(90, "提取 meta.data 样本...")

  # 提取前 100 行 meta.data 供前端表格展示
  meta_sample <- head(pro@meta.data, 100)
  meta_sample$barcode <- rownames(meta_sample)
  # 将 barcode 移到第一列
  meta_sample <- meta_sample[, c("barcode", setdiff(colnames(meta_sample), "barcode"))]

  report(100, "标准化完成")

  list(
    status = "success",
    result_path = archive_path,
    input_file = "seurat_qc.rds",
    stats = list(
      cells = ncol(pro),
      genes = nrow(pro),
      assays = names(pro@assays)
    ),
    meta_data_sample = meta_sample,
    meta_data_total_rows = nrow(pro@meta.data)
  )
}


# ======================================================================
# 3. 降维
#    调用: data_plot.R::my_distPlot3()
# ======================================================================

#* PCA/UMAP/tSNE 降维
#* @post /reduce
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载标准化数据...")

  input_path <- file.path(project_path, "seurat_normalized.rds")
  if (!file.exists(input_path)) stop("请先运行标准化步骤")
  pro <- readRDS(input_path)

  method <- params$method %||% "umap"
  n_dims <- params$n_dims %||% 30
  group_by <- params$group_by %||% "Sample"

  report(30, paste0("运行降维 (", method, ")..."))

  # 执行降维 — 逻辑与 data_plot.R::my_distPlot3() 一致
  pro <- RunPCA(object = pro, verbose = FALSE)

  if (method == "umap") {
    pro <- RunUMAP(object = pro, reduction = "pca", dims = 1:n_dims, verbose = FALSE)
  } else if (method == "tsne") {
    pro <- RunTSNE(object = pro, reduction = "pca", dims = 1:n_dims, perplexity = 30, verbose = FALSE)
  }

  report(70, "生成降维图...")

  # 双命名：归档名 + 管道链名
  plot_archive <- make_output_name(project_path, "3", "reduce", method, "png")
  plot_path <- file.path(project_path, plot_archive)
  png(plot_path, width = 1200, height = 800, res = 150)
  my_distPlot3(pro, method, group_by, n_dims)
  dev.off()

  report(85, "保存数据...")

  rds_archive <- make_output_name(project_path, "3", "reduce", method, "rds")
  archive_path <- file.path(project_path, rds_archive)
  canonical_path <- file.path(project_path, "seurat_reduced.rds")
  save_with_canonical(archive_path, canonical_path, pro)

  report(100, "降维完成")

  # 提取降维坐标供前端 Plotly 渲染
  reduction_key <- if (method == "umap") "umap" else "tsne"
  embeddings <- Embeddings(pro, reduction = reduction_key)
  scatter_data <- list(
    x       = as.numeric(embeddings[, 1]),
    y       = as.numeric(embeddings[, 2]),
    cluster = as.character(pro@meta.data[[group_by]])
  )

  list(
    status = "success",
    result_path = archive_path,
    plot_path = plot_path,
    stats = list(
      cells = ncol(pro),
      method = method,
      n_dims = n_dims,
      reductions = names(pro@reductions)
    ),
    scatter_data = scatter_data
  )
}


# ======================================================================
# 4. 批次聚类
#    调用: data_summary.R::runHarmony(), RenameIdents2()
# ======================================================================

#* Harmony 批次校正 + 聚类
#* @post /cluster
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载标准化数据...")

  input_path <- file.path(project_path, "seurat_normalized.rds")
  if (!file.exists(input_path)) stop("请先运行标准化步骤")
  pro <- readRDS(input_path)

  n_dims <- params$n_dims %||% 30
  resolution <- params$resolution %||% 0.5
  group_by <- params$group_by %||% "Sample"

  report(20, "运行 Harmony 批次校正 + 聚类...")

  # 调用原始函数 — data_summary.R::runHarmony()
  pro <- runHarmony(pro, "harmony", group_by, n_dims, resolution)

  report(70, "生成聚类图...")

  # 双命名：归档名（3张图）
  umap_archive <- make_output_name(project_path, "4", "cluster", "umap", "png")
  plot_path <- file.path(project_path, umap_archive)
  png(plot_path, width = 1200, height = 800, res = 150)
  print(my_distPlot5(pro))
  dev.off()

  sankey_archive <- make_output_name(project_path, "4", "cluster", "sankey", "png")
  plot_path2 <- file.path(project_path, sankey_archive)
  png(plot_path2, width = 1200, height = 1000, res = 150)
  print(my_distPlot4(pro@meta.data))
  dev.off()

  group_archive <- make_output_name(project_path, "4", "cluster", "group_umap", "png")
  plot_path3 <- file.path(project_path, group_archive)
  png(plot_path3, width = 1400, height = 1200, res = 150)
  print(my_distPlot6(pro, group_by))
  dev.off()

  report(85, "保存数据...")

  # 双命名：RDS
  rds_archive <- make_output_name(project_path, "4", "cluster", "harmony", "rds")
  archive_path <- file.path(project_path, rds_archive)
  canonical_path <- file.path(project_path, "seurat_clustered.rds")
  save_with_canonical(archive_path, canonical_path, pro)

  # 调用原始函数生成统计
  cluster_num <- my_cluster_num1(pro@meta.data)
  freq_table  <- my_freqTable(pro@meta.data)

  # 提取前 100 行 meta.data 供前端表格展示
  meta_sample <- head(pro@meta.data, 100)
  meta_sample$barcode <- rownames(meta_sample)
  meta_sample <- meta_sample[, c("barcode", setdiff(colnames(meta_sample), "barcode"))]

  report(100, "聚类完成")

  # 提取 UMAP 坐标供前端渲染 (聚类标签着色)
  embeddings <- tryCatch(
    Embeddings(pro, reduction = "harmony.umap"),
    error = function(e) tryCatch(
      Embeddings(pro, reduction = "umap"),
      error = function(e2) NULL
    )
  )
  scatter_data <- if (!is.null(embeddings)) list(
    x       = as.numeric(embeddings[, 1]),
    y       = as.numeric(embeddings[, 2]),
    cluster = as.character(Idents(pro))
  ) else NULL

  list(
    status = "success",
    result_path = archive_path,
    plot_path = plot_path,
    plot_path2 = plot_path2,
    plot_path3 = plot_path3,
    stats = list(
      cells = ncol(pro),
      clusters = length(levels(Idents(pro))),
      cluster_levels = levels(Idents(pro))
    ),
    cluster_num  = cluster_num,
    freq_table   = freq_table,
    scatter_data = scatter_data,
    meta_data_sample = meta_sample,
    meta_data_total_rows = nrow(pro@meta.data)
  )
}


# ======================================================================
# 5. 差异基因
#    调用: data_summary.R::my_diffTable(), my_diffTable2()
# ======================================================================

#* FindMarkers 差异基因分析
#* @post /markers
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载聚类数据...")

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) stop("请先运行聚类步骤")
  pro <- readRDS(input_path)

  cluster_raw <- params$cluster %||% "All"
  # 前端多选时传逗号分隔字符串（如 "0,1,3"），需拆分为向量
  if (is.character(cluster_raw) && length(cluster_raw) == 1 && grepl(",", cluster_raw)) {
    cluster <- trimws(unlist(strsplit(cluster_raw, ",")))
  } else {
    cluster <- cluster_raw
  }
  min_pct <- params$min_pct %||% 0.25
  logfc <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% TRUE
  p_adj_cutoff <- params$p_val_adj %||% 0.05

  cluster_label <- if (length(cluster) == 1 && cluster == "All") "All" else paste(cluster, collapse = ", ")
  report(30, paste0("运行差异分析 (", cluster_label, ")..."))

  # 调用原始函数 — data_summary.R::my_diffTable()
  diffTable <- my_diffTable(pro, cluster, min_pct, logfc, test_use, only_pos)

  # 按 p_val_adj 阈值过滤
  diffTable <- diffTable[diffTable$p_val_adj < p_adj_cutoff, ]

  report(70, "生成 DotPlot...")

  # 双命名：DotPlot
  ntop <- params$ntop %||% 5
  dotplot_archive <- make_output_name(project_path, "5", "markers", "dotplot", "png")
  plot_path <- file.path(project_path, dotplot_archive)
  png(plot_path, width = 1600, height = 800, res = 150)
  print(my_distPlot7(pro, min_pct, logfc, test_use, only_pos, ntop))
  dev.off()

  report(80, "生成 Heatmap...")

  # 双命名：Heatmap
  heatmap_archive <- make_output_name(project_path, "5", "markers", "heatmap", "png")
  heatmap_path <- file.path(project_path, heatmap_archive)
  tryCatch({
    heatmap_plot <- my_distPlot8(pro, min_pct, logfc, test_use, only_pos, ntop)
    n_clusters <- length(levels(pro))
    heatmap_h <- max(800, 120 * n_clusters)
    png(heatmap_path, width = 1600, height = heatmap_h, res = 150)
    print(heatmap_plot)
    dev.off()
  }, error = function(e) {
    message("Heatmap generation failed: ", e$message)
  })

  report(85, "保存结果...")

  # 双命名：CSV
  csv_archive <- make_output_name(project_path, "5", "markers", "diff_genes", "csv")
  output_csv <- file.path(project_path, csv_archive)
  write.csv(diffTable, output_csv, row.names = FALSE)
  # 管道链名（enrich 步骤需要读取此固定名）
  file.copy(output_csv, file.path(project_path, "diff_genes.csv"), overwrite = TRUE)

  report(100, "差异分析完成")

  list(
    status = "success",
    result_path = output_csv,
    plot_path = plot_path,
    heatmap_path = heatmap_path,
    stats = list(
      total_deg = nrow(diffTable),
      clusters_analyzed = ifelse(cluster_label == "All", "所有聚类", cluster_label)
    ),
    cluster_labels = paste(levels(Idents(pro)), collapse = ","),
    top_genes = head(diffTable, 20)
  )
}


# ======================================================================
# 6. 通路富集
#    调用: data_plot.R::my_distPlot10()
# ======================================================================

#* GO/KEGG/GSEA 富集分析
#* @post /enrich
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载差异基因...")

  # 读取差异基因表
  deg_path <- file.path(project_path, "diff_genes.csv")
  if (!file.exists(deg_path)) stop("请先运行差异基因分析")
  sigDegs <- read.csv(deg_path)

  pathway <- params$pathway %||% "GO"
  direction <- params$direction %||% "Up"
  p_adjust <- params$p_adjust_method %||% "BH"
  pvalue <- params$pvalue_cutoff %||% 0.05
  qvalue <- params$qvalue_cutoff %||% 0.2
  n_term <- params$n_term %||% 10

  report(30, paste0("运行 ", pathway, " 富集分析 (", direction, ")..."))

  # 调用原始函数 — data_plot.R::my_distPlot10()
  result <- my_distPlot10(sigDegs, pathway, direction, p_adjust, pvalue, qvalue, n_term)

  report(80, "保存结果...")

  # 保存图 — 高度根据 term 数量和分析类型动态计算
  if (pathway == "GO") {
    n_rows <- n_term * 3  # BP/CC/MF 三组
    calc_h <- max(1200, n_rows * 55 + 200)
    calc_w <- 2000
  } else if (pathway == "GSEA") {
    # GSEA 是多面板 gseaplot2 网格，每行 2 图，每图约 500px 高
    n_panels <- min(n_term, nrow(result$data))
    n_grid_rows <- ceiling(n_panels / 2)
    calc_h <- max(1200, n_grid_rows * 500 + 100)
    calc_w <- 1800
  } else {
    n_rows <- n_term
    calc_h <- max(1200, n_rows * 55 + 200)
    calc_w <- 2000
  }
  plot_archive <- make_output_name(project_path, "6", "enrich", paste0(pathway, "_", direction), "png")
  plot_path <- file.path(project_path, plot_archive)
  png(plot_path, width = calc_w, height = calc_h, res = 150)
  # GSEA 的 create_gsea_plots 返回 grob (gridExtra::grid.arrange)
  # GO/KEGG 返回 ggplot — 需要不同的输出方式
  if (inherits(result$plot, "grob") || inherits(result$plot, "gtable")) {
    grid::grid.draw(result$plot)
  } else {
    print(result$plot)
  }
  dev.off()

  # 双命名：CSV
  csv_archive <- make_output_name(project_path, "6", "enrich", paste0(pathway, "_", direction), "csv")
  table_path <- file.path(project_path, csv_archive)
  if (nrow(result$data) > 0) {
    write.csv(result$data, table_path, row.names = FALSE)
  }

  report(100, "富集分析完成")

  # 整理富集数据供前端 Plotly 气泡图渲染
  enrich_data <- if (nrow(result$data) > 0) {
    df <- head(result$data, n_term)
    list(
      terms      = as.character(df$Description),
      gene_ratio = as.numeric(sub(".*/", "", df$GeneRatio)) /
                   as.numeric(sub(".+/",  "", df$GeneRatio)),
      p_adjust   = as.numeric(df$p.adjust),
      count      = as.integer(df$Count)
    )
  } else NULL

  list(
    status = "success",
    plot_path = plot_path,
    result_path = table_path,
    stats = list(
      pathway = pathway,
      direction = direction,
      significant_terms = nrow(result$data)
    ),
    enrich_data = enrich_data
  )
}


# ======================================================================
# 7. Marker 表达可视化
#    调用: data_plot.R::my_distPlot9(), my_distPlot11()
# ======================================================================

#* Marker 基因 FeaturePlot + VlnPlot（分别保存两张图）
#* @post /plot_markers
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载聚类数据...")

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) stop("请先运行聚类步骤")
  pro <- readRDS(input_path)

  cluster_raw <- params$cluster %||% "C1"
  # 前端多选时传逗号分隔字符串（如 "C1,C3"），需拆分为向量
  if (is.character(cluster_raw) && length(cluster_raw) == 1 && grepl(",", cluster_raw)) {
    clusters <- trimws(unlist(strsplit(cluster_raw, ",")))
  } else {
    clusters <- cluster_raw
  }
  min_pct <- params$min_pct %||% 0.25
  logfc <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% TRUE
  ntop <- params$ntop %||% 8

  # 解析用户自定义关注基因（逗号分隔字符串）
  custom_genes_raw <- params$custom_genes %||% NULL
  custom_genes <- NULL
  if (!is.null(custom_genes_raw) && nchar(custom_genes_raw) > 0) {
    custom_genes <- trimws(unlist(strsplit(custom_genes_raw, ",")))
    custom_genes <- custom_genes[nchar(custom_genes) > 0]
  }

  # 计算图片高度（基于基因数量，含自定义基因）
  n_custom <- if (!is.null(custom_genes)) length(custom_genes) else 0
  n_genes <- min(ntop, 8) + n_custom
  calc_height <- max(800, ceiling(n_genes / 2) * 400)

  plot_paths <- list()
  total <- length(clusters)

  for (idx in seq_along(clusters)) {
    cl <- clusters[idx]
    pct <- 10 + floor(80 * (idx - 1) / total)
    report(pct, paste0("生成 ", cl, " 的 Marker 表达图 (", idx, "/", total, ")..."))

    result <- my_distPlot9(pro, cl, min_pct, logfc, test_use, only_pos, ntop, custom_genes)

    # FeaturePlot
    feature_archive <- make_output_name(project_path, "7", "plot_markers", paste0("feature_", cl), "png")
    plot_path_feature <- file.path(project_path, feature_archive)
    png(plot_path_feature, width = 1600, height = calc_height, res = 150)
    print(result$feature)
    dev.off()
    # 创建固定名称副本，供前端用 canonical name 访问
    file.copy(plot_path_feature, file.path(project_path, paste0("plot_markers_feature_", cl, ".png")), overwrite = TRUE)

    # VlnPlot
    vln_archive <- make_output_name(project_path, "7", "plot_markers", paste0("vln_", cl), "png")
    plot_path_vln <- file.path(project_path, vln_archive)
    png(plot_path_vln, width = 1600, height = calc_height, res = 150)
    print(result$vln)
    dev.off()
    file.copy(plot_path_vln, file.path(project_path, paste0("plot_markers_vln_", cl, ".png")), overwrite = TRUE)

    plot_paths[[cl]] <- list(feature = plot_path_feature, vln = plot_path_vln)
  }

  report(100, "Marker 表达图生成完成")

  list(
    status = "success",
    clusters = clusters,
    plot_paths = plot_paths,
    stats = list(clusters = paste(clusters, collapse = ", "), ntop = ntop)
  )
}


# ======================================================================
# 7b. 成对聚类差异分析
#     调用: data_summary.R::my_diffTable2()
# ======================================================================

#* 分组差异分析 (Group1 vs Group2，每组支持多个聚类)
#* @post /markers_pairwise
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载聚类数据...")

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) stop("请先运行聚类步骤")
  pro <- readRDS(input_path)

  # 前端传逗号分隔字符串，需拆分为向量
  parse_clusters <- function(raw, default) {
    val <- raw %||% default
    if (is.character(val) && length(val) == 1 && grepl(",", val)) {
      return(trimws(unlist(strsplit(val, ","))))
    }
    return(val)
  }

  group1 <- parse_clusters(params$cluster_1, "C1")
  group2 <- parse_clusters(params$cluster_2, "C2")
  min_pct  <- params$min_pct %||% 0.25
  logfc    <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% FALSE
  p_adj_cutoff <- params$p_val_adj %||% 0.05

  g1_label <- paste(group1, collapse = "+")
  g2_label <- paste(group2, collapse = "+")
  report(30, paste0("运行分组差异分析: ", g1_label, " vs ", g2_label, "..."))

  # 调用更新后的 my_diffTable2()，传入两组聚类向量
  diffTable <- my_diffTable2(pro, min_pct, logfc, test_use, only_pos, group1, group2)

  if (is.character(diffTable)) stop(diffTable)

  # 按 p_val_adj 阈值过滤
  diffTable <- diffTable[diffTable$p_val_adj < p_adj_cutoff, ]

  report(80, "保存结果...")

  # 双命名：CSV
  csv_archive <- make_output_name(
    project_path, "5b", "markers_pairwise",
    paste0(g1_label, "_vs_", g2_label), "csv"
  )
  output_csv <- file.path(project_path, csv_archive)
  write.csv(diffTable, output_csv, row.names = FALSE)

  report(100, "分组差异分析完成")

  # 火山图数据：精简版全量（gene_id + log2FC + p_val_adj）
  volcano <- data.frame(
    gene_id     = diffTable$gene_id,
    avg_log2FC  = as.numeric(diffTable$avg_log2FC),
    p_val_adj   = as.numeric(diffTable$p_val_adj),
    stringsAsFactors = FALSE
  )

  list(
    status = "success",
    result_path = output_csv,
    stats = list(
      group1 = g1_label,
      group2 = g2_label,
      total_deg = nrow(diffTable)
    ),
    top_genes = head(diffTable, 20),
    volcano_data = volcano
  )
}


# ======================================================================
# 8. 细胞注释
#    调用: data_summary.R::RunAnno()
# ======================================================================

#* SingleR 自动注释 / 手动注释
#* @post /annotate
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载聚类数据...")

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) stop("请先运行聚类步骤")
  pro <- readRDS(input_path)

  anno_type <- params$anno_type %||% "自动注释"
  group_by <- params$group_by %||% "CellType"
  mkfs <- params$markers_table  # 手动注释用

  report(30, paste0("运行细胞注释 (", anno_type, ")..."))

  # 调用原始函数 — data_summary.R::RunAnno()
  if (anno_type == "手动注释" && !is.null(mkfs)) {
    mkfs_df <- as.data.frame(mkfs)
    result <- RunAnno(pro, mkfs_df, anno_type, group_by)
  } else {
    result <- RunAnno(pro, NULL, "自动注释", group_by)
  }

  pro <- result$data1
  freq_table <- result$data2

  report(70, "生成注释图...")

  # 双命名：UMAP 注释图
  umap_archive <- make_output_name(project_path, "8", "annotate", "umap", "png")
  plot_path <- file.path(project_path, umap_archive)
  png(plot_path, width = 1400, height = 800, res = 150)
  print(DimPlot(pro, reduction = 'umap', group.by = 'CellType',
                label = T, cols = clusterCols, repel = T))
  dev.off()

  report(85, "保存数据...")

  # 双命名：RDS
  rds_archive <- make_output_name(project_path, "8", "annotate", "result", "rds")
  archive_path <- file.path(project_path, rds_archive)
  canonical_path <- file.path(project_path, "seurat_annotated.rds")
  save_with_canonical(archive_path, canonical_path, pro)

  report(100, "细胞注释完成")

  list(
    status = "success",
    result_path = archive_path,
    plot_path = plot_path,
    stats = list(
      cells = ncol(pro),
      cell_types = length(unique(pro$CellType)),
      anno_type = anno_type
    ),
    freq_table = freq_table
  )
}


# ======================================================================
# 4b. 细胞群亚类提取
#     对应 v1: subset(hm_data(), Cluster == subC)
# ======================================================================

#* 提取选定 Cluster 亚类的 Seurat 子集
#* @post /subset_cluster
function(req) {
  body <- jsonlite::fromJSON(req$postBody)
  project_path <- body$project_path
  params <- body$params
  task_id <- params$task_id
  report <- create_progress_reporter(task_id)

  report(5, "加载聚类数据...")

  input_path <- file.path(project_path, "seurat_clustered.rds")
  if (!file.exists(input_path)) stop("请先运行聚类步骤")
  pro <- readRDS(input_path)

  selected_clusters <- params$clusters
  if (is.null(selected_clusters) || length(selected_clusters) == 0) {
    stop("请至少选择一个细胞群")
  }

  report(30, paste0("提取亚类: ", paste(selected_clusters, collapse = ", "), "..."))

  # 调用原始逻辑 — 与 v1 app-new.R 的 subset(hm_data(), Cluster == subC) 一致
  sub_data <- subset(pro, Cluster %in% selected_clusters)

  report(70, "保存亚类数据...")

  # 双命名：RDS
  cluster_label <- paste(selected_clusters, collapse = "-")
  rds_archive <- make_output_name(project_path, "4b", "subset", cluster_label, "rds")
  archive_path <- file.path(project_path, rds_archive)
  saveRDS(sub_data, archive_path)

  # 提取 meta.data 样本供前端展示
  meta_sample <- head(sub_data@meta.data, 100)
  meta_sample$barcode <- rownames(meta_sample)
  meta_sample <- meta_sample[, c("barcode", setdiff(colnames(meta_sample), "barcode"))]

  report(100, "亚类提取完成")

  list(
    status = "success",
    result_path = archive_path,
    stats = list(
      cells = ncol(sub_data),
      genes = nrow(sub_data),
      clusters_selected = selected_clusters
    ),
    meta_data_sample = meta_sample,
    meta_data_total_rows = nrow(sub_data@meta.data)
  )
}


# ======================================================================
# 9. 格式转换 (新增功能 — 旧系统不存在)
# ======================================================================

#* Seurat 对象格式转换
#* @post /convert
function(req) {
  params <- jsonlite::fromJSON(req$postBody)
  input_path <- params$input_path
  output_format <- params$output_format
  output_path <- params$output_path

  if (!file.exists(input_path)) stop(paste("文件不存在:", input_path))

  ext <- tolower(tools::file_ext(input_path))

  # 加载对象
  if (ext == "rds") {
    obj <- readRDS(input_path)
  } else {
    stop(paste("不支持的输入格式:", ext))
  }

  # 转换
  if (output_format == "h5seurat") {
    SeuratDisk::SaveH5Seurat(obj, filename = output_path, overwrite = TRUE)
  } else if (output_format == "h5ad") {
    h5seurat_path <- paste0(output_path, ".h5seurat")
    SeuratDisk::SaveH5Seurat(obj, filename = h5seurat_path, overwrite = TRUE)
    SeuratDisk::Convert(h5seurat_path, dest = "h5ad", overwrite = TRUE)
    file.remove(h5seurat_path)
  } else if (output_format == "rds") {
    saveRDS(obj, output_path)
  }

  list(
    status = "success",
    cells = ncol(obj),
    genes = nrow(obj)
  )
}
