# =====================================================================
# scCloud v2 — R 包安装脚本
# 用途: Docker build 阶段安装所有 R 依赖
#
# 包列表来源: data_plot.R / data_summary.R 中的 library() 调用
# 保证与旧系统使用完全相同的 R 包
#
# 策略: 串行安装避免并行编译竞争 (Ncpus=1)
#       使用中科大 CRAN 镜像加速下载
# =====================================================================

# 使用中科大 CRAN 镜像加速下载
ustc_cran <- "https://mirrors.ustc.edu.cn/CRAN/"

# Bioconductor 镜像 — 清华 TUNA (主) / 中科大 (备)
options(BioC_mirror = "https://mirrors.tuna.tsinghua.edu.cn/bioconductor")

# ===== 第 1 步: 关键基础包 (串行，避免锁冲突) =====
cat("===== [1/5] 安装基础依赖 =====\n")

# 强制升级 Matrix — R 4.3.2 自带 1.6-1.1，SeuratObject 需要 >= 1.6.4
# Matrix 1.7+ 需要 R >= 4.4，所以从 Archive 安装 1.6-5（最后兼容 R 4.3 的版本）
cat("  升级 Matrix 到 1.6-5...\n")
install.packages(
  "https://cran.r-project.org/src/contrib/Archive/Matrix/Matrix_1.6-5.tar.gz",
  repos = NULL, type = "source"
)

base_pkgs <- c("irlba", "Rcpp", "RcppEigen", "RcppArmadillo", "BH")
install.packages(base_pkgs, repos = ustc_cran, Ncpus = 1L)

# ===== 第 2 步: Seurat + 核心依赖 (串行) =====
cat("===== [2/5] 安装 Seurat 核心 =====\n")
seurat_pkgs <- c(
  "SeuratObject", "Seurat", "sctransform",
  "harmony", "gtools"
)
install.packages(seurat_pkgs, repos = ustc_cran, Ncpus = 1L)

# ===== 第 3 步: 可视化 + 工具包 (可并行, 无重编译) =====
cat("===== [3/5] 安装可视化和工具包 =====\n")
viz_pkgs <- c(
  "ggplot2", "ggrepel", "ggalluvial", "purrr",
  "Cairo", "RCurl", "cowplot", "tidyverse",
  "data.table", "Hmisc", "ggpubr", "viridis",
  "future", "RColorBrewer", "gridExtra",
  "ggplotify", "patchwork", "stringr", "dplyr",
  "msigdbr",
  # Plumber API
  "plumber", "jsonlite",
  # Redis
  "redux",
  # GitHub 安装用
  "remotes"
)
install.packages(viz_pkgs, repos = ustc_cran, Ncpus = 2L)

# ===== 第 4 步: Bioconductor 包 =====
cat("===== [4/5] 安装 Bioconductor 包 =====\n")

if (!requireNamespace("BiocManager", quietly = TRUE)) {
  install.packages("BiocManager", repos = ustc_cran)
}

# 设置 BiocManager 使用中科大镜像
# 如果中科大镜像出问题, 回退到官方源
tryCatch({
  BiocManager::install(
    c("glmGamPoi", "SingleR", "celldex",
      "clusterProfiler", "enrichplot",
      "org.Hs.eg.db", "org.Mm.eg.db"),
    ask = FALSE, update = FALSE
  )
}, error = function(e) {
  cat("中科大 Bioconductor 镜像失败, 使用官方源...\n")
  options(BioC_mirror = "https://bioconductor.org")
  BiocManager::install(
    c("glmGamPoi", "SingleR", "celldex",
      "clusterProfiler", "enrichplot",
      "org.Hs.eg.db", "org.Mm.eg.db"),
    ask = FALSE, update = FALSE
  )
})

# ===== 第 5 步: GitHub 包 =====
cat("===== [5/5] 安装 GitHub 包 =====\n")

# SeuratDisk — 格式转换
remotes::install_github("mojaveazure/seurat-disk", upgrade = "never")


# ===== 验证安装 =====
cat("===== 验证所有包 =====\n")

required <- c(
  "Seurat", "sctransform", "glmGamPoi", "harmony",
  "SingleR", "celldex", "clusterProfiler", "enrichplot",
  "org.Hs.eg.db", "org.Mm.eg.db",
  "ggplot2", "ggalluvial", "cowplot", "viridis", "patchwork",
  "msigdbr", "ggpubr", "ggplotify", "ggrepel",
  "plumber", "jsonlite", "redux"
)

failed <- c()
for (pkg in required) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    cat(paste0("  ✗ ", pkg, " — 未安装!\n"))
    failed <- c(failed, pkg)
  } else {
    cat(paste0("  ✓ ", pkg, " (", packageVersion(pkg), ")\n"))
  }
}
if (length(failed) > 0) {
  stop(paste("以下包安装失败:", paste(failed, collapse = ", ")))
}

cat("===== 所有包安装完成 =====\n")
