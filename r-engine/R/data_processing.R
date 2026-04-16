# =====================================================================
# scCloud v2 — 原始计算函数 (data_processing.R)
# 来源: test1/script/data_processing.R
# 注意: 此文件为旧系统的【原始代码】，仅移除了 Shiny 依赖的部分。
#       任何计算逻辑不得修改，以保证分析流程的纯净和一致。
# =====================================================================

####定义函数

##mito distribution
get_mito <- function(pro, samplename) {
  mito <- pro$percent.mt
  p05 <- paste0(sum(mito <= 5), '(', sprintf("%.2f", (sum(mito <= 5) / length(mito) * 100)), '%)')
  p10 <- paste0(sum(mito <= 10), '(', sprintf("%.2f", (sum(mito <= 10) / length(mito) * 100)), '%)')
  p15 <- paste0(sum(mito <= 15), '(', sprintf("%.2f", (sum(mito <= 15) / length(mito) * 100)), '%)')
  p20 <- paste0(sum(mito <= 20), '(', sprintf("%.2f", (sum(mito <= 20) / length(mito) * 100)), '%)')
  p30 <- paste0(sum(mito <= 30), '(', sprintf("%.2f", (sum(mito <= 30) / length(mito) * 100)), '%)')
  p50 <- paste0(sum(mito <= 50), '(', sprintf("%.2f", (sum(mito <= 50) / length(mito) * 100)), '%)')
  p80 <- paste0(sum(mito <= 80), '(', sprintf("%.2f", (sum(mito <= 80) / length(mito) * 100)), '%)')
  p100 <- paste0(sum(mito <= 100), '(', sprintf("%.2f", (sum(mito <= 100) / length(mito) * 100)), '%)')
  mitoGradient <- c("mt<=5%", "mt<=10%", "mt<=15%", "mt<=20%", "mt<=30%", "mt<=50%", "mt<=80%", 'mt<=100%')
  cellsPct <- c(p05, p10, p15, p20, p30, p50, p80, p100)
  dataMito <- data.frame(Gradient = mitoGradient, CellsPct = cellsPct)
  dataMitoT <- as.data.frame(t(dataMito))[-1,]
  colnames(dataMitoT) <- dataMito$Gradient
  rownames(dataMitoT) <- samplename
  return(dataMitoT)
}

#cell distribution by mt.pct
totalMT_result <- function(exp) {
      totalMT = data.frame()
      for (spid in unique(exp@meta.data$Sample)) {
        tmp = get_mito(subset(x = exp, subset = Sample == spid), spid)
        totalMT <- rbind(totalMT, tmp)
      }
      totalMT <- rbind(totalMT, get_mito(exp, 'Total'))
      totalMT <-data.frame(Sample = row.names(totalMT), totalMT, check.names = F)
      return(totalMT)
}

#cell distribution by mt.pct after filtering
totalMT1_result <- function(pro) {
      totalMT1 = data.frame()
      for (spid in unique(pro@meta.data$Sample)) {
        #print(spid)
        tmp = get_mito(subset(x = pro, subset = Sample == spid), spid)
        totalMT1 <- rbind(totalMT1, tmp)
      }
      totalMT1 <- rbind(totalMT1, get_mito(pro, 'Total'))
      totalMT1 <-data.frame(Sample = row.names(totalMT1), totalMT1, check.names = F)
      return(totalMT1)
}



##umi gene distribution
get_umi_gene <- function(pro, samplename) {
  meta <- pro@meta.data
  umisMax <- max(meta$nCount_RNA)
  umisMed <- round(median(meta$nCount_RNA), 0)
  umisMin <- min(meta$nCount_RNA)
  genesMax <- max(meta$nFeature_RNA)
  genesMed <- round(median(meta$nFeature_RNA), 0)
  genesMin <- min(meta$nFeature_RNA)
  Content <- c("umisMax", 'umisMed', "umisMin", "genesMax", "genesMed", "genesMin")
  umiGeneValue <- c(umisMax, umisMed, umisMin, genesMax, genesMed, genesMin)
  dt <- data.frame(Content = Content, Value = umiGeneValue)
  dtT <- as.data.frame(t(dt))[-1,]
  colnames(dtT) <- dt$Content
  rownames(dtT) <- samplename
  return(dtT)
}

#umi gene distribution     
umiGene_result <- function(exp) {
      umiGene = data.frame()
      for (spid in unique(exp@meta.data$Sample)) {
        tmp = get_umi_gene(subset(x = exp, subset = Sample == spid), spid)
        umiGene <- rbind(umiGene, tmp)
      }
      umiGene <- rbind(umiGene, get_umi_gene(exp, 'Total'))
      umiGene <-data.frame(Sample = row.names(umiGene), umiGene, check.names = F)
      return(umiGene)
}

#umi gene distribution after filtering 
umiGene1_result <- function(pro) {
      umiGene1 = data.frame()
      for (spid in unique(pro@meta.data$Sample)) {
        tmp = get_umi_gene(subset(x = pro, subset = Sample == spid), spid)
        umiGene1 <- rbind(umiGene1, tmp)
      }
      umiGene1 <- rbind(umiGene1, get_umi_gene(pro, 'Total'))
      umiGene1 <-data.frame(Sample = row.names(umiGene1), umiGene1, check.names = F)
      return(umiGene1)
}
