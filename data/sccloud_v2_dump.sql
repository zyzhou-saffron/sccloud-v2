/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.6-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: sccloud_v2
-- ------------------------------------------------------
-- Server version	11.8.6-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `user_id` int(11) NOT NULL,
  `description` text DEFAULT NULL,
  `species` enum('human','mouse') DEFAULT NULL,
  `storage_path` varchar(512) DEFAULT NULL,
  `status` enum('created','uploading','ready','archived') DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES
(4,'1234',1,NULL,'human','/data/projects/1/1234','created','2026-04-15 14:15:43','2026-04-15 14:15:43'),
(6,'1231313',4,NULL,'human','/data/projects/4/1231313','created','2026-04-16 02:16:58','2026-04-16 02:16:58'),
(7,'123123',5,NULL,'human','/data/projects/5/123123','created','2026-04-16 02:51:23','2026-04-16 02:51:23'),
(8,'P23',5,NULL,'human','/data/projects/5/P23','created','2026-04-16 03:41:48','2026-04-16 03:41:48'),
(9,'we\'q\'e\'w\'q',6,NULL,'human','/data/projects/6/we\'q\'e\'w\'q','created','2026-04-16 15:10:10','2026-04-16 15:10:10');
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tasks` (
  `id` varchar(36) NOT NULL,
  `project_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `step` enum('qc','normalize','reduce','cluster','markers','enrich','annotate','convert','markers_pairwise','plot_markers') NOT NULL,
  `status` enum('pending','running','completed','failed','cancelled') DEFAULT NULL,
  `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`params`)),
  `progress` int(11) DEFAULT NULL,
  `result_path` varchar(512) DEFAULT NULL,
  `error_msg` text DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tasks_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tasks`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `tasks` WRITE;
/*!40000 ALTER TABLE `tasks` DISABLE KEYS */;
INSERT INTO `tasks` VALUES
('0559c4de-1444-4704-a328-3ec4de56b1d2',7,5,'qc','failed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/4/1231313/57da3ed3_Samples.filter.rds\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-16 02:55:58','2026-04-16 02:55:58','2026-04-16 02:55:58'),
('05bd1ba1-1f92-453e-9a59-7534975a1228',8,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/5/P23/18096f17_Samples.filter.rds\"}',100,'/data/projects/5/P23/seurat_qc.rds',NULL,'2026-04-17 01:42:10','2026-04-17 01:42:14','2026-04-17 01:42:10'),
('05be969f-665d-4620-a06e-fa02294a0821',8,5,'enrich','completed','{\"pathway\": \"KEGG\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_KEGG_Up.csv',NULL,'2026-04-17 01:46:15','2026-04-17 01:46:16','2026-04-17 01:46:15'),
('05fe8005-1d36-445a-aa20-f532336489fc',7,5,'enrich','completed','{\"pathway\": \"GSEA\", \"direction\": \"Up\"}',100,'/data/projects/5/123123/enrich_GSEA_Up.csv',NULL,'2026-04-16 03:34:51','2026-04-16 03:35:06','2026-04-16 03:34:51'),
('0c20bd62-5333-4025-b9c2-6864a1144f75',4,1,'markers_pairwise','completed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes_C1_vs_C2.csv',NULL,'2026-04-15 15:35:54','2026-04-15 15:35:57','2026-04-15 15:35:54'),
('0fa86feb-8398-4ec6-9247-11bd6293d307',8,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_clustered.rds',NULL,'2026-04-17 01:44:14','2026-04-17 01:44:34','2026-04-17 01:44:14'),
('115fdf8f-6413-416f-adee-46b6208994fc',8,5,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_GO_Up.csv',NULL,'2026-04-17 02:17:53','2026-04-17 02:18:22','2026-04-17 02:17:53'),
('14c5569c-653d-4c95-8647-525cabc4311e',8,5,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,NULL,NULL,'2026-04-17 01:45:27','2026-04-17 01:45:31','2026-04-17 01:45:27'),
('158e254e-6fdc-49c5-b9d2-cde37a9c57b5',9,6,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/6/we\'q\'e\'w\'q/seurat_clustered.rds',NULL,'2026-04-16 15:14:11','2026-04-16 15:14:31','2026-04-16 15:14:11'),
('1f672b9e-3f09-4abe-8a68-72dedd212fdd',8,5,'markers_pairwise','completed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/P23/diff_genes_C1_vs_C2.csv',NULL,'2026-04-16 03:48:46','2026-04-16 03:48:46','2026-04-16 03:48:46'),
('285706ad-eabc-479a-b73d-bc312b39fda0',7,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/4/1231313/57da3ed3_Samples.filter.rds\"}',100,'/data/projects/5/123123/seurat_qc.rds',NULL,'2026-04-16 03:06:06','2026-04-16 03:06:11','2026-04-16 03:06:06'),
('2d1c02f5-1bf2-4dca-a8d7-f0b447bde797',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 14:49:27','2026-04-15 14:49:35','2026-04-15 14:49:27'),
('2de2d84b-efcf-44f5-9dd2-6555ea752b11',4,1,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.36, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/1/1234/seurat_clustered.rds',NULL,'2026-04-15 15:21:13','2026-04-15 15:21:40','2026-04-15 15:21:13'),
('2f724513-91a6-4ce0-bab1-381217b26df7',8,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/5/P23/659f8adb_Samples.filter.rds\"}',100,'/data/projects/5/P23/seurat_qc.rds',NULL,'2026-04-17 01:50:59','2026-04-17 01:51:02','2026-04-17 01:50:59'),
('32b1f2c9-4be7-481f-b3da-378cda7d6c36',8,5,'markers_pairwise','completed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/P23/diff_genes_C1_vs_C2.csv',NULL,'2026-04-16 03:48:26','2026-04-16 03:48:27','2026-04-16 03:48:26'),
('35836d7e-6f89-4be0-ade8-55d7e3d2d057',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 16:09:04','2026-04-15 16:09:07','2026-04-15 16:09:04'),
('3998b437-e2c4-48c4-be1f-0a7c96b10187',4,1,'enrich','failed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 16:15:29','2026-04-15 16:16:39','2026-04-15 16:15:29'),
('3a56dfdf-22d5-4fcd-a097-a63b75148780',8,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_clustered.rds',NULL,'2026-04-17 01:52:52','2026-04-17 01:53:13','2026-04-17 01:52:52'),
('3ab7c056-8db8-471c-bf1d-ac35cb688d89',8,5,'normalize','completed','{}',100,'/data/projects/5/P23/seurat_normalized.rds',NULL,'2026-04-17 01:51:10','2026-04-17 01:51:31','2026-04-17 01:51:10'),
('3baf4699-deba-46e8-ac39-cc58d860cfb4',9,6,'normalize','completed','{}',100,'/data/projects/6/we\'q\'e\'w\'q/seurat_normalized.rds',NULL,'2026-04-16 15:12:57','2026-04-16 15:13:13','2026-04-16 15:12:57'),
('3fb0969e-a00d-4edb-935d-ef7a31f3c19e',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 16:08:49','2026-04-15 16:08:58','2026-04-15 16:08:49'),
('43368816-74bd-4d40-a95c-38a35b25f828',7,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/123123/seurat_clustered.rds',NULL,'2026-04-16 03:19:13','2026-04-16 03:19:34','2026-04-16 03:19:13'),
('445e8c96-7944-4cac-8bb2-03ae9f269364',7,5,'normalize','completed','{}',100,'/data/projects/5/123123/seurat_normalized.rds',NULL,'2026-04-16 03:06:15','2026-04-16 03:06:35','2026-04-16 03:06:15'),
('46d8dbd4-04fa-4596-9c24-26cdf6fcbdc4',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 16:01:22','2026-04-15 16:01:25','2026-04-15 16:01:22'),
('47588135-30e1-4755-8e6c-8f5a76a3cf7e',7,5,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/123123/diff_genes.csv',NULL,'2026-04-16 03:07:54','2026-04-16 03:07:58','2026-04-16 03:07:54'),
('480164a1-7f9b-4fcc-bf78-b658c3845d78',9,6,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/6/we\'q\'e\'w\'q/diff_genes.csv',NULL,'2026-04-16 15:23:13','2026-04-16 15:23:22','2026-04-16 15:23:13'),
('48adc048-1106-4c48-83a2-e6bfb4c04c61',7,5,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/5/123123/enrich_GO_Up.csv',NULL,'2026-04-16 03:23:14','2026-04-16 03:24:14','2026-04-16 03:23:14'),
('498c1222-bca4-4fdc-add5-9b0d5dd4949f',7,5,'enrich','completed','{\"pathway\": \"KEGG\", \"direction\": \"Up\"}',100,'/data/projects/5/123123/enrich_KEGG_Up.csv',NULL,'2026-04-16 03:32:18','2026-04-16 03:32:19','2026-04-16 03:32:18'),
('4be6704b-c6c2-4b62-a7a5-6fa491687004',8,5,'markers_pairwise','completed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/P23/diff_genes_C1_vs_C2.csv',NULL,'2026-04-17 01:45:32','2026-04-17 01:45:33','2026-04-17 01:45:32'),
('58eb3879-887d-4c40-8b88-8f85c588bbbc',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 16:12:43','2026-04-15 16:12:52','2026-04-15 16:12:43'),
('613d2491-0c44-4e10-a9d9-a2f8fbc91833',8,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_clustered.rds',NULL,'2026-04-16 14:34:31','2026-04-16 14:34:52','2026-04-16 14:34:31'),
('63cd6498-a449-4f0f-8b0a-d2153c506497',8,5,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,NULL,NULL,'2026-04-17 02:09:09','2026-04-17 02:09:13','2026-04-17 02:09:09'),
('64b74207-ccc6-486e-9589-e94c0980d308',9,6,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/6/we\'q\'e\'w\'q/enrich_GO_Up.csv',NULL,'2026-04-16 15:16:27','2026-04-16 15:16:55','2026-04-16 15:16:27'),
('65bf3402-3927-49de-9131-c96a01704112',7,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/123123/seurat_reduced.rds',NULL,'2026-04-16 03:06:46','2026-04-16 03:07:03','2026-04-16 03:06:46'),
('665f55ca-9338-4520-a9b4-367a720b0712',7,5,'enrich','completed','{\"pathway\": \"GSEA\", \"direction\": \"Up\"}',100,'/data/projects/5/123123/enrich_GSEA_Up.csv',NULL,'2026-04-16 03:32:27','2026-04-16 03:32:38','2026-04-16 03:32:27'),
('67f66f65-3e34-476a-b71c-bfe324e41da8',8,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_reduced.rds',NULL,'2026-04-16 03:45:23','2026-04-16 03:45:42','2026-04-16 03:45:23'),
('680ec06b-5640-4e8f-89b0-f9afa41c1855',8,5,'enrich','completed','{\"pathway\": \"GSEA\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_GSEA_Up.csv',NULL,'2026-04-17 01:45:50','2026-04-17 01:46:02','2026-04-17 01:45:50'),
('69ad2392-3072-4b27-b67a-56b89efa073f',8,5,'enrich','completed','{\"pathway\": \"GSEA\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_GSEA_Up.csv',NULL,'2026-04-17 02:17:32','2026-04-17 02:17:42','2026-04-17 02:17:31'),
('6dbccc38-53de-4a9f-999a-b506af0de0a8',8,5,'normalize','completed','{}',100,'/data/projects/5/P23/seurat_normalized.rds',NULL,'2026-04-16 14:33:46','2026-04-16 14:34:04','2026-04-16 14:33:46'),
('6ec815de-a872-493e-ace8-6cec99f52da2',8,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_clustered.rds',NULL,'2026-04-16 03:46:12','2026-04-16 03:46:33','2026-04-16 03:46:12'),
('7635f349-bdc3-4253-85de-74375698d3d8',4,1,'markers','failed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 15:53:52','2026-04-15 15:53:59','2026-04-15 15:53:52'),
('775f7a4b-971f-4dc5-a9cc-900faf3d49c6',8,5,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_GO_Up.csv',NULL,'2026-04-16 03:48:51','2026-04-16 03:49:44','2026-04-16 03:48:51'),
('7910ec21-326b-4442-8eb9-dd44deb97627',4,1,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/1/1234/seurat_reduced.rds',NULL,'2026-04-15 14:21:11','2026-04-15 14:21:34','2026-04-15 14:21:11'),
('7b250f27-03a4-483e-8d9f-e1a9f804136b',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 15:36:03','2026-04-15 15:36:10','2026-04-15 15:36:03'),
('7f8c8074-d47c-4353-a9ff-e9755bc3ffc1',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 15:37:19','2026-04-15 15:37:25','2026-04-15 15:37:19'),
('8107489e-4a9c-4a83-891f-79ebda0bc755',8,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_reduced.rds',NULL,'2026-04-17 01:42:52','2026-04-17 01:43:10','2026-04-17 01:42:52'),
('8123053e-3e58-443d-8cec-ae191c953cc8',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 16:01:58','2026-04-15 16:02:04','2026-04-15 16:01:58'),
('83f7e1f5-304f-4fe7-8f97-ef4a96501055',7,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/123123/seurat_clustered.rds',NULL,'2026-04-16 03:18:00','2026-04-16 03:18:23','2026-04-16 03:18:00'),
('844ffcb2-acab-4892-9f08-bf28cc08662a',8,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_reduced.rds',NULL,'2026-04-17 01:52:15','2026-04-17 01:52:33','2026-04-17 01:52:15'),
('871ca543-d359-4ccc-ac6c-2b3c29528f02',4,1,'markers','failed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'All connection attempts failed','2026-04-15 14:42:49','2026-04-15 14:42:49','2026-04-15 14:42:49'),
('8cd1e167-5595-4f3e-abd3-00ab74df3874',4,1,'plot_markers','failed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 15:49:24','2026-04-15 15:49:27','2026-04-15 15:49:24'),
('908299cd-ab53-40c1-9445-4123f758af8c',9,6,'markers_pairwise','completed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/6/we\'q\'e\'w\'q/diff_genes_C1_vs_C2.csv',NULL,'2026-04-16 15:15:29','2026-04-16 15:15:32','2026-04-16 15:15:29'),
('93bbe2a7-580a-4523-a68e-3daac814c945',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 15:41:09','2026-04-15 15:41:17','2026-04-15 15:41:09'),
('9555d42d-3536-4f90-bd74-d71aac926f72',9,6,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,NULL,NULL,'2026-04-16 15:15:27','2026-04-16 15:15:31','2026-04-16 15:15:27'),
('99f6abd8-c1ea-4d2e-9d27-57aa010042de',8,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/5/P23/4176b02f_Samples.filter.rds\"}',100,'/data/projects/5/P23/seurat_qc.rds',NULL,'2026-04-17 02:05:41','2026-04-17 02:05:45','2026-04-17 02:05:41'),
('9cecf221-d139-4d3e-8738-31e03399cbe7',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 16:12:57','2026-04-15 16:13:02','2026-04-15 16:12:56'),
('9d061a09-49bf-40e3-9f17-d32500d724d2',9,6,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/6/we\'q\'e\'w\'q/diff_genes.csv',NULL,'2026-04-16 15:30:16','2026-04-16 15:30:23','2026-04-16 15:30:16'),
('9faac786-1ed4-4949-830a-434a676ead44',7,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1}',100,'/data/projects/5/123123/seurat_qc.rds',NULL,'2026-04-16 03:39:16','2026-04-16 03:39:27','2026-04-16 03:39:16'),
('a112fce9-8d95-449d-a283-eebb7380d92d',7,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/123123/seurat_clustered.rds',NULL,'2026-04-16 03:07:08','2026-04-16 03:07:28','2026-04-16 03:07:08'),
('a32151ab-7245-4a0c-961d-e527bec84bab',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 15:22:04','2026-04-15 15:22:12','2026-04-15 15:22:04'),
('a4dc3f15-352f-49ab-83bd-64814239a762',7,5,'qc','failed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/4/1231313/57da3ed3_Samples.filter.rds\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-16 02:51:24','2026-04-16 02:51:24','2026-04-16 02:51:24'),
('a589efd3-02de-4858-8190-c1e8c0228aef',4,1,'markers_pairwise','failed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 15:34:24','2026-04-15 15:34:25','2026-04-15 15:34:24'),
('a9bd520c-e63c-4ede-991c-d9168475ba40',4,1,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/1/1234/913b6670_Samples.filter.rds\"}',100,'/data/projects/1/1234/seurat_qc.rds',NULL,'2026-04-15 14:20:24','2026-04-15 14:20:28','2026-04-15 14:20:24'),
('aa3cdb07-7e28-407a-a4f1-d2742cc439bb',4,1,'plot_markers','failed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 15:49:06','2026-04-15 15:49:11','2026-04-15 15:49:06'),
('ac10950c-8bd1-448e-a98c-e7b96c547d73',7,5,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.5, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/123123/seurat_clustered.rds',NULL,'2026-04-16 03:22:17','2026-04-16 03:22:41','2026-04-16 03:22:17'),
('ace29714-3b02-41a3-98a6-c7dfc207d2ba',8,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1}',100,'/data/projects/5/P23/seurat_qc.rds',NULL,'2026-04-16 14:33:38','2026-04-16 14:33:41','2026-04-16 14:33:38'),
('afd4f4d3-ee2e-4462-bc4b-5ddb2db2c383',6,4,'qc','failed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-16 02:17:00','2026-04-16 02:17:00','2026-04-16 02:17:00'),
('b49dbd74-69aa-4f07-939e-e986770c9b94',6,4,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/4/1231313/57da3ed3_Samples.filter.rds\"}',100,'/data/projects/4/1231313/seurat_qc.rds',NULL,'2026-04-16 02:17:45','2026-04-16 02:17:49','2026-04-16 02:17:45'),
('b5a06f60-fb99-461d-ae6b-af6b7b49f157',4,1,'cluster','completed','{\"method\": \"harmony\", \"resolution\": 0.36, \"n_dims\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/1/1234/seurat_clustered.rds',NULL,'2026-04-15 14:22:00','2026-04-15 14:22:24','2026-04-15 14:22:00'),
('b9dd0072-630c-44e5-8bf6-42b19ea654ab',4,1,'enrich','failed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',0,NULL,'All connection attempts failed','2026-04-15 14:47:20','2026-04-15 14:47:20','2026-04-15 14:47:20'),
('bb692d8b-1b0a-4cd4-858f-a47e722577ec',8,5,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,NULL,NULL,'2026-04-16 03:48:06','2026-04-16 03:48:10','2026-04-16 03:48:06'),
('bb9a9e4c-d996-491f-a396-6a0ea0cd0f79',4,1,'normalize','completed','{}',100,'/data/projects/1/1234/seurat_normalized.rds',NULL,'2026-04-15 14:20:42','2026-04-15 14:21:03','2026-04-15 14:20:42'),
('bc441f6b-de5e-4c6b-9edb-be7ef49583b6',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 15:53:41','2026-04-15 15:53:46','2026-04-15 15:53:41'),
('bfa73fa5-1c41-43db-9765-f0b4c65116b4',4,1,'plot_markers','failed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 15:46:24','2026-04-15 15:46:30','2026-04-15 15:46:24'),
('c0e9cca6-45ca-472d-ba32-2189e4329b1f',8,5,'annotate','completed','{\"mode\": \"auto\", \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_annotated.rds',NULL,'2026-04-16 03:50:11','2026-04-16 03:50:22','2026-04-16 03:50:11'),
('c1755b46-fa06-44f5-9b51-c777058bebb3',7,5,'markers_pairwise','failed','{\"cluster_1\": \"C1\", \"cluster_2\": \"C2\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',0,NULL,'R 引擎返回错误 404: {\"error\":\"404 - Resource Not Found\"}','2026-04-16 03:08:05','2026-04-16 03:08:06','2026-04-16 03:08:05'),
('c6c8281a-5650-4bd8-9f3e-c686664afd57',8,5,'normalize','completed','{}',100,'/data/projects/5/P23/seurat_normalized.rds',NULL,'2026-04-17 02:05:55','2026-04-17 02:06:14','2026-04-17 02:05:55'),
('c79a1b56-2b7b-4bda-8cd4-33b3d56e653d',4,1,'qc','failed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/1/1234/913b6670_Samples.filter.rds\"}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-15 14:16:47','2026-04-15 14:16:51','2026-04-15 14:16:47'),
('c8ff9dea-da49-4bc2-8ad8-b51835da33be',8,5,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/P23/diff_genes.csv',NULL,'2026-04-16 03:47:47','2026-04-16 03:47:51','2026-04-16 03:47:47'),
('ca2c2e8e-8766-4946-aefe-1338d240d576',9,6,'qc','failed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-16 15:10:13','2026-04-16 15:10:13','2026-04-16 15:10:13'),
('cb824084-ad3f-4541-b8e8-0bd3e6b09f0b',8,5,'normalize','completed','{}',100,'/data/projects/5/P23/seurat_normalized.rds',NULL,'2026-04-17 01:42:22','2026-04-17 01:42:42','2026-04-17 01:42:22'),
('cd68719a-5232-4628-b201-4150bbd695db',4,1,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/1/1234/913b6670_Samples.filter.rds\"}',100,'/data/projects/1/1234/seurat_qc.rds',NULL,'2026-04-15 14:29:33','2026-04-15 14:29:37','2026-04-15 14:29:33'),
('d19d93b6-556a-4940-92a7-bb9cc71180cb',8,5,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/5/P23/diff_genes.csv',NULL,'2026-04-17 01:54:29','2026-04-17 01:54:36','2026-04-17 01:54:29'),
('d3e5a84c-7581-4204-83fb-53807059b502',9,6,'enrich','completed','{\"pathway\": \"GSEA\", \"direction\": \"Up\"}',100,'/data/projects/6/we\'q\'e\'w\'q/enrich_GSEA_Up.csv',NULL,'2026-04-16 15:16:04','2026-04-16 15:16:12','2026-04-16 15:16:04'),
('d7a0f8f3-6110-4913-9105-39c49b8d1d73',4,1,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,NULL,NULL,'2026-04-15 16:02:34','2026-04-15 16:02:36','2026-04-15 16:02:34'),
('dc39cd48-9b0e-4dfc-8869-f3877e1a1fa2',9,6,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,'/data/projects/6/we\'q\'e\'w\'q/diff_genes.csv',NULL,'2026-04-16 15:15:12','2026-04-16 15:15:16','2026-04-16 15:15:12'),
('e541b7d1-a388-4200-9757-ca6a86adcd36',7,5,'plot_markers','completed','{\"cluster\": \"C1\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',100,NULL,NULL,'2026-04-16 03:08:02','2026-04-16 03:08:06','2026-04-16 03:08:02'),
('e7897232-e441-4154-8953-d9ab9ec9d4e9',8,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_reduced.rds',NULL,'2026-04-16 14:34:09','2026-04-16 14:34:27','2026-04-16 14:34:09'),
('ea5306e5-d439-4f89-a39a-c4b5e771b80b',8,5,'normalize','completed','{}',100,'/data/projects/5/P23/seurat_normalized.rds',NULL,'2026-04-16 03:43:39','2026-04-16 03:44:00','2026-04-16 03:43:39'),
('eaa1f528-8723-4f0e-b705-01b4003985bb',8,5,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/5/P23/enrich_GO_Up.csv',NULL,'2026-04-17 01:54:56','2026-04-17 01:55:49','2026-04-17 01:54:56'),
('ed8ecca6-0313-453f-a72f-9b453ad214d2',8,5,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/5/P23/seurat_reduced.rds',NULL,'2026-04-17 02:07:29','2026-04-17 02:07:47','2026-04-17 02:07:29'),
('efe3a75d-aca0-4bd3-b118-76fc75a61f27',7,5,'enrich','completed','{\"pathway\": \"GO\", \"direction\": \"Up\"}',100,'/data/projects/5/123123/enrich_GO_Up.csv',NULL,'2026-04-16 03:31:05','2026-04-16 03:32:06','2026-04-16 03:31:05'),
('f1b5c6b5-b02f-4ae0-aaa8-a13b9c5e6f9f',9,6,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/6/we\'q\'e\'w\'q/366a0cf3_Samples.filter.rds\"}',100,'/data/projects/6/we\'q\'e\'w\'q/seurat_qc.rds',NULL,'2026-04-16 15:12:11','2026-04-16 15:12:14','2026-04-16 15:12:11'),
('f225266b-c5e4-44db-83c7-8e716e515eef',8,5,'qc','completed','{\"max_mt_ratio\": 20, \"min_features\": 200, \"max_features\": 5000, \"umi_min_pct\": 0, \"umi_max_pct\": 1, \"rds_file_path\": \"/data/projects/5/P23/b86bb873_example.Samples.rds\"}',100,'/data/projects/5/P23/seurat_qc.rds',NULL,'2026-04-16 03:42:38','2026-04-16 03:42:42','2026-04-16 03:42:38'),
('f4f2daa9-aec1-4b12-b974-44cc7a4f2274',9,6,'plot_markers','failed','{\"cluster\": \"\", \"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\", \"ntop\": 5}',0,NULL,'R 引擎返回错误 500: {\"error\":\"500 - Internal server error\"}','2026-04-16 15:29:58','2026-04-16 15:30:01','2026-04-16 15:29:58'),
('f834a8dd-e7fe-4913-88e3-687ee5adf3ba',4,1,'markers','completed','{\"min_pct\": 0.1, \"logfc_threshold\": 0.25, \"test_use\": \"wilcox\"}',100,'/data/projects/1/1234/diff_genes.csv',NULL,'2026-04-15 16:01:04','2026-04-15 16:01:13','2026-04-15 16:01:04'),
('fb196387-05e8-4726-a88f-679f5927e514',9,6,'reduce','completed','{\"method\": \"umap\", \"n_pcs\": 30, \"group_by\": \"Sample\"}',100,'/data/projects/6/we\'q\'e\'w\'q/seurat_reduced.rds',NULL,'2026-04-16 15:13:16','2026-04-16 15:13:33','2026-04-16 15:13:16');
/*!40000 ALTER TABLE `tasks` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user') DEFAULT NULL,
  `max_projects` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'testuser',NULL,'$2b$12$/zyCn1g6sN/8avSFKs/mreOUmMI1a3tzMlCT/bkvEblw2K.zXNg2m','user',5,'2026-04-15 05:20:41','2026-04-15 05:20:41'),
(2,'1234',NULL,'$2b$12$ocACy18rjNpGQjoBBHLHFu.qZCOh.ytXQMbcBYh56.q77W7djuqSm','user',5,'2026-04-15 13:44:56','2026-04-15 13:44:56'),
(3,'111',NULL,'$2b$12$vKc2nj5OLspVH4HgdxGJNO9HxVv.A5IaUBrVBOjBbqX.eKRIIozBq','user',5,'2026-04-15 16:18:51','2026-04-15 16:18:51'),
(4,'testuser12',NULL,'$2b$12$osEDo1WUPmc6DFDr1yyS6ePPvLglf4UCa8duFU97pAQhBX9eqGeo.','user',5,'2026-04-16 02:16:44','2026-04-16 02:16:44'),
(5,'testuser123',NULL,'$2b$12$.V.SJol3eanzNoPl0vOwOuwLxzRWEnd6nJ48jtC9042qW1CGwLjBm','user',5,'2026-04-16 02:51:11','2026-04-16 02:51:11'),
(6,'zyzhou',NULL,'$2b$12$wY2rr/GYG6xrIGS93VZNCuKHO86Es5LqQZlkUaOh0QgfnbC8g8Yiy','user',5,'2026-04-16 15:08:37','2026-04-16 15:08:37');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-04-17  3:04:45
