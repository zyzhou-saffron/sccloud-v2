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

my_diffTable <- function(pro,rawC,minPct,logFc,test,pos){
  if(rawC!="All"){
    cluster.markers <- FindMarkers(object = pro, ident.1 = rawC, min.pct = minPct, logfc.threshold = logFc,test.use=test,only.pos=pos)
    diffTable <- data.frame(gene_id = rownames(cluster.markers), cluster.markers, Cluster=rawC)#%>%
    #mutate(across(where(is.numeric), ~ formatC(., format = "e", digits = 4)))
    return(diffTable)
    #print(diffTable, digits = 4, scientific = TRUE)
  }else{
    mergeDif <-  data.frame()
    newident <- levels(pro)
    for (l in newident) {
      cluster.markers <- FindMarkers(object = pro, ident.1 = l, min.pct = minPct, logfc.threshold = logFc,test.use=test,only.pos=pos)
      diffTable <- data.frame(gene_id = rownames(cluster.markers), cluster.markers, Cluster=l)#%>%
      #mutate(across(where(is.numeric), ~ formatC(., format = "e", digits = 4)))
      mergeDif <- rbind(mergeDif,diffTable)
    }
    return(mergeDif)
    #print(mergeDif, digits = 4, scientific = TRUE)
  }
}


my_diffTable2 <- function(pro,minPct,logFc,test,pos,rawC1){
tryCatch({
  if(length(rawC1)==2){
    cluster.markers <- FindMarkers(object = pro, ident.1 = rawC1[1],ident.2 = rawC1[2], min.pct = minPct, logfc.threshold = logFc,test.use=test,only.pos=pos)
    diffTable <- data.frame(gene_id = rownames(cluster.markers), cluster.markers, Cluster=paste(rawC1, collapse = "vs") )#%>%
    #mutate(across(where(is.numeric), ~ formatC(., format = "e", digits = 4)))
    return(diffTable)
    #print(diffTable, digits = 4, scientific = TRUE)
  }
  }, error = function(e) {
    return("Error: select two cell cluster!")
  }
  )
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
