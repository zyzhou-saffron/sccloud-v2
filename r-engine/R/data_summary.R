# =====================================================================
# scCloud v2 — 原始计算函数 (data_summary.R)
# 来源: test1/script/data_summary.R
# 注意: 此文件为旧系统的【原始代码】，仅移除了 Shiny/this.path 依赖。
#       script_dir 替换为 "data/" (Docker 容器内的数据目录)。
#       任何计算逻辑不得修改，以保证分析流程的纯净和一致。
# =====================================================================

suppressMessages({
  library(Seurat)
  library(ggplot2)
  library(sctransform)
  library(harmony)
  library(glmGamPoi)
  library(gtools)
  library(dplyr)
  library(SingleR)
  library(celldex)
  library(ggalluvial)
  library(cowplot)
})

# [替换] 旧系统使用 this.path::this.path() 定位脚本目录
# 容器环境下数据存放在 /app/data/
script_dir <- "data/ref"


RunSCT <- function(data){
  pro <- SCTransform(data, method = "glmGamPoi", vars.to.regress = "percent.mt", verbose = F)
  return(pro)
}



# functions
RenameIdents2 <- function(pro) {
  ident <- as.numeric(levels(pro))
  newident <- ident + 1
  names(newident) <- levels(pro)
  pro <- RenameIdents(pro, newident)
  Idents(pro) <- paste0('C', Idents(pro))
  levels(pro) <- mixedsort(levels(pro))
  pro$Cluster <- Idents(pro)
  return(pro)
}

runHarmony <- function(sctpro1,redu1,group1,nDim,res){
   if(redu1=="harmony"){
       sctpro1 <- RunPCA(object = sctpro1, verbose = FALSE)
       sctpro1 <- RunUMAP(object = sctpro1, reduction = "pca", dims = 1:nDim, verbose = FALSE)
       
       sctpro1@meta.data[[group1]] <- as.character(sctpro1@meta.data[[group1]]) # Seurat v5
       
       #sctpro1 <- harmony::RunHarmony(sctpro1, group.by.vars = group1 , reduction = 'pca', assay.use = 'SCT', verbose = FALSE) # Seurat v4
       sctpro1 <- harmony::RunHarmony(sctpro1, group.by.vars = group1, reduction.use = 'pca', assay.use = 'SCT', verbose = FALSE) # Seurat v5
       
       sctpro1 <- RunUMAP(sctpro1, reduction = "harmony", dims = 1:nDim)
       sctpro1 <- FindNeighbors(sctpro1, reduction = "harmony", dims = 1:nDim, verbose = FALSE) %>% FindClusters(resolution = res,verbose = FALSE)
       
       sctpro1 <- RenameIdents2(sctpro1)
       sctpro1$Cluster <- Idents(sctpro1)
       return(sctpro1)
   }

}



my_cluster_num1 <- function(df){
    cluster_num1 <- as.data.frame(table(df$Cluster,df$Sample))
    colnames(cluster_num1)<- c("Cluster","Sample","CellNumber")
    return(cluster_num1)
}

my_freqTable <- function(df){
    cluster_num <- as.matrix(table(df$Cluster,df$Sample))
    freqTable <- as.data.frame(prop.table(x = cluster_num, margin = 2))
    colnames(freqTable)<- c("Cluster","Sample","Freq")
    return(freqTable)
}

my_diffTable <- function(pro, rawC, minPct, logFc, test, pos) {
  # rawC 可以是 "All"、单个 cluster 名称、或多个 cluster 名称的向量
  if (length(rawC) == 1 && rawC == "All") {
    # 对所有聚类逐一做 FindMarkers (1 vs rest)
    mergeDif <- data.frame()
    newident <- levels(pro)
    for (l in newident) {
      cluster.markers <- FindMarkers(
        object = pro, ident.1 = l,
        min.pct = minPct, logfc.threshold = logFc,
        test.use = test, only.pos = pos
      )
      diffTable <- data.frame(
        gene_id = rownames(cluster.markers),
        cluster.markers, Cluster = l
      )
      mergeDif <- rbind(mergeDif, diffTable)
    }
    return(mergeDif)
  } else {
    # 对指定的一个或多个聚类逐一做 FindMarkers (1 vs rest)
    mergeDif <- data.frame()
    for (cl in rawC) {
      cluster.markers <- FindMarkers(
        object = pro, ident.1 = cl,
        min.pct = minPct, logfc.threshold = logFc,
        test.use = test, only.pos = pos
      )
      diffTable <- data.frame(
        gene_id = rownames(cluster.markers),
        cluster.markers, Cluster = cl
      )
      mergeDif <- rbind(mergeDif, diffTable)
    }
    return(mergeDif)
  }
}


my_diffTable2 <- function(pro, minPct, logFc, test, pos, group1, group2) {
  # group1 和 group2 可以各自是一个或多个 cluster 的向量
  # Seurat FindMarkers 原生支持向量形式的 ident.1 / ident.2
  tryCatch({
    if (length(group1) == 0 || length(group2) == 0) {
      return("Error: 两组均需至少选择一个聚类")
    }
    cluster.markers <- FindMarkers(
      object = pro,
      ident.1 = group1,
      ident.2 = group2,
      min.pct = minPct,
      logfc.threshold = logFc,
      test.use = test,
      only.pos = pos
    )
    label <- paste0(
      paste(group1, collapse = "+"), " vs ",
      paste(group2, collapse = "+")
    )
    diffTable <- data.frame(
      gene_id = rownames(cluster.markers),
      cluster.markers,
      Cluster = label,
      row.names = NULL
    )
    return(diffTable)
  }, error = function(e) {
    return(paste0("Error: ", e$message))
  })
}

is_upper_strict <- function(x) {
  !grepl("[a-z]", x)  # 检查是否没有小写字母
}


RunAnno <- function(pro,mkfs,cellAnno,group) {
  if(cellAnno=="自动注释"){
    hpca.se = readRDS(file.path(script_dir,"HumanPrimaryCellAtlasDatar.rds"))
    bpe.se = readRDS(file.path(script_dir,"BlueprintEncodeDatar.rds"))
    clusters <- pro@meta.data$Cluster
    pro_for_SingleR <- GetAssayData(pro, layer="data")
    pred.hesc <- SingleR(test = pro_for_SingleR, 
                     ref = list(BPE=bpe.se, HPCA=hpca.se), 
                     labels = list(bpe.se$label.main, hpca.se$label.main),
                     clusters = clusters, 
                     assay.type.test = "logcounts", 
                     assay.type.ref = "logcounts")
    celltype = data.frame(ClusterID=rownames(pred.hesc), 
                      celltype=pred.hesc$labels, 
                      stringsAsFactors = F) 
    pro@meta.data$singleR = celltype[match(clusters,celltype$ClusterID),'celltype']
    annoCell <- celltype$celltype
    names(annoCell) <- celltype$ClusterID
    pro <- RenameIdents(pro, annoCell)
    levels(pro) <- mixedsort(levels(pro))
    pro$CellType <- Idents(pro)
    
    cluster_cell_num=as.matrix(table(pro@meta.data[,c("Cluster","singleR")]) )
    cluster_num <- as.matrix(table(Idents(pro), pro@meta.data$Sample))
    freq_table <- prop.table(x = cluster_num, margin = 2)
    freqTable <- data.frame(freq_table)
    colnames(freqTable) <- c('CellType', 'Sample', 'Freq')
    freqTable$CellType <- as.factor(freqTable$CellType)
    freqTable$Sample <- as.factor(freqTable$Sample)
    
    return(list(data1 = pro, data2 = freqTable))

  }else if(cellAnno=="手动注释"){
    mkfs <- as.data.frame(apply(mkfs, 2, function(x) { gsub(' |\t+', '', x, fixed = F, perl = T) }))
    colnames(mkfs) <- c("Cluster", "CellType", "Markers")
   
    annoCell <- mkfs$CellType
    names(annoCell) <- mkfs$Cluster
    pro <- RenameIdents(pro, annoCell)
    levels(pro) <- mixedsort(levels(pro))
    pro$CellType <- Idents(pro)
    
    cluster_cell_num=as.matrix(table(pro@meta.data[,c("Cluster","CellType")]) )
    cluster_num <- as.matrix(table(Idents(pro), pro@meta.data$Sample))
    freq_table <- prop.table(x = cluster_num, margin = 2)
    freqTable <- data.frame(freq_table)
    colnames(freqTable) <- c('CellType', 'Sample', 'Freq')
    freqTable$CellType <- as.factor(freqTable$CellType)
    freqTable$Sample <- as.factor(freqTable$Sample)
    
    return(list(data1 = pro, data2 = freqTable))
  }
   
}
