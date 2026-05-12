# =====================================================================
# gene_id_convert.R — Ensembl ID ↔ Gene Symbol 自动转换
#
# 三个核心函数:
#   detect_ensembl_ids()      — 检测基因名是否为 Ensembl ID
#   convert_ensembl_to_symbol() — 将 Seurat 对象行名从 Ensembl ID 转为 symbol
#   lookup_gene_symbol()      — 双向查找（Ensembl ↔ symbol）
# =====================================================================

#' 检测基因名是否为 Ensembl ID
#'
#' @param gene_names character vector of gene names (e.g. rownames of a Seurat object)
#' @return list with: is_ensembl (logical), species ("human"/"mouse"/NULL), match_ratio (numeric)
detect_ensembl_ids <- function(gene_names) {
  sample_ids <- head(gene_names, 200)
  ensembl_pattern <- "^ENS[A-Z]*G[0-9]{11}"
  match_ratio <- mean(grepl(ensembl_pattern, sample_ids))

  is_ensembl <- match_ratio > 0.5
  species <- NULL
  if (is_ensembl) {
    if (any(grepl("^ENSMUSG", sample_ids))) {
      species <- "mouse"
    } else if (any(grepl("^ENSG", sample_ids))) {
      species <- "human"
    } else {
      species <- "human"  # 默认
    }
  }

  list(is_ensembl = is_ensembl, species = species, match_ratio = match_ratio)
}


#' 将 Seurat 对象的行名从 Ensembl ID 转换为 Gene Symbol
#'
#' @param seurat_obj Seurat object
#' @param species "human" or "mouse" (auto-detected if NULL)
#' @param keep_unmapped logical, keep unmapped Ensembl IDs as-is
#' @return modified Seurat object with gene symbols as rownames
convert_ensembl_to_symbol <- function(seurat_obj, species = NULL, keep_unmapped = TRUE) {
  if (is.null(species)) {
    info <- detect_ensembl_ids(rownames(seurat_obj))
    if (!info$is_ensembl) return(seurat_obj)
    species <- info$species
  }

  # 选择注释数据库
  org_db <- switch(species,
    human = {
      if (!requireNamespace("org.Hs.eg.db", quietly = TRUE))
        stop("未安装 org.Hs.eg.db 包")
      org.Hs.eg.db::org.Hs.eg.db
    },
    mouse = {
      if (!requireNamespace("org.Mm.eg.db", quietly = TRUE))
        stop("未安装 org.Mm.eg.db 包")
      org.Mm.eg.db::org.Mm.eg.db
    },
    stop(paste("不支持的物种:", species))
  )

  ensembl_ids <- rownames(seurat_obj)

  # Ensembl ID 去掉版本号后缀 (ENSG00000141510.1 → ENSG00000141510)
  clean_ids <- sub("\\.[0-9]+$", "", ensembl_ids)

  # 查询映射
  mapping <- tryCatch(
    AnnotationDbi::select(
      org_db,
      keys = clean_ids,
      columns = "SYMBOL",
      keytype = "ENSEMBL"
    ),
    error = function(e) {
      message(paste("AnnotationDbi::select 失败:", e$message))
      data.frame(ENSEMBL = character(0), SYMBOL = character(0))
    }
  )

  if (nrow(mapping) == 0) {
    message("警告: 无法映射任何 Ensembl ID，保留原始行名")
    return(seurat_obj)
  }

  # 去重：每个 ENSEMBL 只保留第一个非 NA 的 SYMBOL
  mapping <- mapping[!is.na(mapping$SYMBOL), ]
  mapping <- mapping[!duplicated(mapping$ENSEMBL), ]

  # 构建映射向量
  map_vec <- setNames(mapping$SYMBOL, mapping$ENSEMBL)

  # 映射基因名
  new_names <- map_vec[clean_ids]
  unmapped <- is.na(new_names)
  if (keep_unmapped) {
    new_names[unmapped] <- ensembl_ids[unmapped]
  }

  # 处理重复 symbol：多个 Ensembl ID → 同一 symbol，保留表达量最高的
  dup_symbols <- unique(new_names[!unmapped & duplicated(new_names[!unmapped])])
  if (length(dup_symbols) > 0) {
    counts <- Seurat::GetAssayData(seurat_obj, assay = "RNA", layer = "counts")
    for (sym in dup_symbols) {
      idx <- which(new_names == sym & !unmapped)
      if (length(idx) <= 1) next

      # 计算每个基因的平均表达量
      mean_expr <- Matrix::rowMeans(counts[idx, , drop = FALSE])
      keep_idx <- idx[which.max(mean_expr)]
      drop_idx <- setdiff(idx, keep_idx)

      # 被丢弃的保留原 Ensembl ID
      if (keep_unmapped) {
        new_names[drop_idx] <- ensembl_ids[drop_idx]
      } else {
        new_names[drop_idx] <- NA
      }
    }
  }

  # 过滤 NA（keep_unmapped = FALSE 时可能产生）
  if (!keep_unmapped) {
    keep <- !is.na(new_names)
    seurat_obj <- seurat_obj[keep, ]
    new_names <- new_names[keep]
    ensembl_ids <- ensembl_ids[keep]
    clean_ids <- clean_ids[keep]
  }

  # 存储映射元数据
  final_map <- setNames(new_names, ensembl_ids)
  seurat_obj@misc$ensembl_symbol_map <- final_map
  seurat_obj@misc$original_gene_ids <- ensembl_ids
  seurat_obj@misc$gene_id_type <- "symbol"
  seurat_obj@misc$unmapped_genes <- ensembl_ids[ensembl_ids == new_names & grepl("^ENS", ensembl_ids)]

  # 替换所有 assay 的 rownames
  for (assay_name in Seurat::Assays(seurat_obj)) {
    assay_data <- Seurat::GetAssayData(seurat_obj, assay = assay_name, layer = "counts")
    if (!is.null(assay_data)) {
      rownames(assay_data) <- new_names
      seurat_obj[[assay_name]] <- Seurat::CreateAssayObject(counts = assay_data)
    }
  }

  # 替换主 assay 的 data slot
  for (assay_name in Seurat::Assays(seurat_obj)) {
    data_slot <- tryCatch(
      Seurat::GetAssayData(seurat_obj, assay = assay_name, layer = "data"),
      error = function(e) NULL
    )
    if (!is.null(data_slot)) {
      rownames(data_slot) <- new_names
      seurat_obj <- Seurat::SetAssayData(seurat_obj, assay = assay_name, layer = "data", new.data = data_slot)
    }
  }

  n_mapped <- sum(ensembl_ids != new_names | !grepl("^ENS", new_names))
  n_total <- length(ensembl_ids)
  message(sprintf("基因名转换完成: %d/%d 个 Ensembl ID 成功映射为 symbol", n_mapped, n_total))

  seurat_obj
}


#' 双向查找基因名（Ensembl ID ↔ Symbol）
#'
#' @param gene_query character, 用户输入的基因名（可能是 Ensembl ID 或 symbol）
#' @param seurat_obj Seurat object
#' @return character resolved gene name, or NULL if not found
lookup_gene_symbol <- function(gene_query, seurat_obj) {
  if (is.null(gene_query) || nchar(gene_query) == 0) return(NULL)

  current_rownames <- rownames(seurat_obj)

  # 1. 直接匹配
  if (gene_query %in% current_rownames) {
    return(gene_query)
  }

  # 2. 大小写不敏感匹配
  idx <- which(tolower(current_rownames) == tolower(gene_query))
  if (length(idx) > 0) {
    return(current_rownames[idx[1]])
  }

  # 3. 查找映射表
  ensembl_map <- seurat_obj@misc$ensembl_symbol_map
  if (!is.null(ensembl_map)) {
    # 用户输入 Ensembl ID → 查 symbol
    clean_query <- sub("\\.[0-9]+$", "", gene_query)
    if (clean_query %in% names(ensembl_map)) {
      return(ensembl_map[[clean_query]])
    }
    # 用户输入 symbol → 反向查 Ensembl ID
    reverse_idx <- which(tolower(ensembl_map) == tolower(gene_query))
    if (length(reverse_idx) > 0) {
      ensembl_id <- names(ensembl_map)[reverse_idx[1]]
      # 如果该 Ensembl ID 在当前 rownames 中，返回它
      if (ensembl_id %in% current_rownames) return(ensembl_id)
      # 否则返回映射到的 symbol
      return(ensembl_map[[ensembl_id]])
    }
  }

  # 4. 模糊匹配（输入是 symbol 的子集）
  fuzzy_idx <- which(grepl(paste0("^", toupper(gene_query)), toupper(current_rownames)))
  if (length(fuzzy_idx) == 1) {
    return(current_rownames[fuzzy_idx])
  }

  NULL
}
