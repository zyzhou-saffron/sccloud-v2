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

  report(40, "生成 QC 统计...")

  # 调用原始函数
  totalMT <- totalMT_result(exp)
  umiGene <- umiGene_result(exp)

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

  report(80, "保存结果...")

  output_path <- file.path(project_path, "seurat_qc.rds")
  saveRDS(pro, output_path)

  report(100, "质控完成")

  list(
    status = "success",
    result_path = output_path,
    stats = list(
      total_cells_before = ncol(exp),
      total_cells_after = ncol(pro),
      total_genes = nrow(pro),
      samples = length(unique(pro@meta.data$Sample))
    ),
    mito_table_before = totalMT,
    mito_table_after = totalMT1,
    umi_gene_before = umiGene,
    umi_gene_after = umiGene1
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

  output_path <- file.path(project_path, "seurat_normalized.rds")
  saveRDS(pro, output_path)

  report(100, "标准化完成")

  list(
    status = "success",
    result_path = output_path,
    stats = list(
      cells = ncol(pro),
      genes = nrow(pro),
      assays = names(pro@assays)
    )
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

  # 保存图片 (调用原始函数逻辑)
  plot_path <- file.path(project_path, paste0("plot_reduce_", method, ".png"))
  png(plot_path, width = 1200, height = 800, res = 150)
  my_distPlot3(pro, method, group_by, n_dims)
  dev.off()

  report(85, "保存数据...")

  output_path <- file.path(project_path, "seurat_reduced.rds")
  saveRDS(pro, output_path)

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
    result_path = output_path,
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

  # 保存 UMAP 图 (调用原始函数)
  plot_path <- file.path(project_path, "plot_cluster.png")
  png(plot_path, width = 1200, height = 800, res = 150)
  print(my_distPlot5(pro))
  dev.off()

  # 保存 Sankey 图
  plot_path2 <- file.path(project_path, "plot_cluster_sankey.png")
  png(plot_path2, width = 1200, height = 1000, res = 150)
  print(my_distPlot4(pro@meta.data))
  dev.off()

  # 保存分组 Cluster UMAP 图 — data_plot.R::my_distPlot6()
  plot_path3 <- file.path(project_path, "plot_cluster_group.png")
  png(plot_path3, width = 1400, height = 1200, res = 150)
  print(my_distPlot6(pro, group_by))
  dev.off()

  report(85, "保存数据...")

  output_path <- file.path(project_path, "seurat_clustered.rds")
  saveRDS(pro, output_path)

  # 调用原始函数生成统计
  cluster_num <- my_cluster_num1(pro@meta.data)
  freq_table  <- my_freqTable(pro@meta.data)

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
    result_path = output_path,
    plot_path = plot_path,
    stats = list(
      cells = ncol(pro),
      clusters = length(levels(pro)),
      cluster_levels = levels(pro)
    ),
    cluster_num  = cluster_num,
    freq_table   = freq_table,
    scatter_data = scatter_data
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

  cluster <- params$cluster %||% "All"
  min_pct <- params$min_pct %||% 0.25
  logfc <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% TRUE

  report(30, paste0("运行差异分析 (", cluster, ")..."))

  # 调用原始函数 — data_summary.R::my_diffTable()
  diffTable <- my_diffTable(pro, cluster, min_pct, logfc, test_use, only_pos)

  report(70, "生成 DotPlot...")

  # 保存 DotPlot (调用原始函数)
  ntop <- params$ntop %||% 5
  plot_path <- file.path(project_path, "plot_markers_dotplot.png")
  png(plot_path, width = 1600, height = 800, res = 150)
  print(my_distPlot7(pro, min_pct, logfc, test_use, only_pos, ntop))
  dev.off()

  report(80, "生成 Heatmap...")

  # 保存 Heatmap (调用 my_distPlot8)
  heatmap_path <- file.path(project_path, "plot_markers_heatmap.png")
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

  # 保存差异基因表
  output_csv <- file.path(project_path, "diff_genes.csv")
  write.csv(diffTable, output_csv, row.names = FALSE)

  report(100, "差异分析完成")

  list(
    status = "success",
    result_path = output_csv,
    plot_path = plot_path,
    stats = list(
      total_deg = nrow(diffTable),
      clusters_analyzed = ifelse(cluster == "All", "所有聚类", cluster)
    ),
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
  plot_path <- file.path(project_path, paste0("plot_enrich_", pathway, "_", direction, ".png"))
  png(plot_path, width = calc_w, height = calc_h, res = 150)
  # GSEA 的 create_gsea_plots 返回 grob (gridExtra::grid.arrange)
  # GO/KEGG 返回 ggplot — 需要不同的输出方式
  if (inherits(result$plot, "grob") || inherits(result$plot, "gtable")) {
    grid::grid.draw(result$plot)
  } else {
    print(result$plot)
  }
  dev.off()

  # 保存表格
  table_path <- file.path(project_path, paste0("enrich_", pathway, "_", direction, ".csv"))
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

  cluster <- params$cluster %||% "C1"
  min_pct <- params$min_pct %||% 0.25
  logfc <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% TRUE
  ntop <- params$ntop %||% 8

  report(40, paste0("生成 ", cluster, " 的 Marker 表达图..."))

  # 调用原始函数 — data_plot.R::my_distPlot9() 返回 list(feature, vln)
  result <- my_distPlot9(pro, cluster, min_pct, logfc, test_use, only_pos, ntop)

  # 计算图片高度（基于基因数量）
  n_genes <- min(ntop, 8)
  calc_height <- max(800, ceiling(n_genes / 2) * 400)

  # 分别保存 FeaturePlot 和 VlnPlot
  plot_path_feature <- file.path(project_path, paste0("plot_markers_feature_", cluster, ".png"))
  png(plot_path_feature, width = 1600, height = calc_height, res = 150)
  print(result$feature)
  dev.off()

  report(70, "保存 VlnPlot...")

  plot_path_vln <- file.path(project_path, paste0("plot_markers_vln_", cluster, ".png"))
  png(plot_path_vln, width = 1600, height = calc_height, res = 150)
  print(result$vln)
  dev.off()

  report(100, "Marker 表达图生成完成")

  list(
    status = "success",
    plot_path_feature = plot_path_feature,
    plot_path_vln = plot_path_vln,
    stats = list(cluster = cluster, ntop = ntop)
  )
}


# ======================================================================
# 7b. 成对聚类差异分析
#     调用: data_summary.R::my_diffTable2()
# ======================================================================

#* 双簇成对差异分析 (C1 vs C2)
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

  cluster1 <- params$cluster1 %||% "C1"
  cluster2 <- params$cluster2 %||% "C2"
  min_pct  <- params$min_pct %||% 0.25
  logfc    <- params$logfc_threshold %||% 0.25
  test_use <- params$test_use %||% "wilcox"
  only_pos <- params$only_pos %||% FALSE

  report(30, paste0("运行成对差异分析: ", cluster1, " vs ", cluster2, "..."))

  # 调用原始函数 — data_summary.R::my_diffTable2()
  diffTable <- my_diffTable2(pro, min_pct, logfc, test_use, only_pos, c(cluster1, cluster2))

  if (is.character(diffTable)) stop(diffTable)

  report(80, "保存结果...")

  output_csv <- file.path(project_path,
    paste0("diff_genes_", cluster1, "_vs_", cluster2, ".csv"))
  write.csv(diffTable, output_csv, row.names = FALSE)

  report(100, "成对差异分析完成")

  list(
    status = "success",
    result_path = output_csv,
    stats = list(
      cluster1 = cluster1,
      cluster2 = cluster2,
      total_deg = nrow(diffTable)
    ),
    top_genes = head(diffTable, 20)
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

  # UMAP 注释图
  plot_path <- file.path(project_path, "plot_annotate.png")
  png(plot_path, width = 1400, height = 800, res = 150)
  print(DimPlot(pro, reduction = 'umap', group.by = 'CellType',
                label = T, cols = clusterCols, repel = T))
  dev.off()

  report(85, "保存数据...")

  output_path <- file.path(project_path, "seurat_annotated.rds")
  saveRDS(pro, output_path)

  report(100, "细胞注释完成")

  list(
    status = "success",
    result_path = output_path,
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
