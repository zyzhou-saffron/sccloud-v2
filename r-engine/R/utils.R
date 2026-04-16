# scCloud v2 — R 工具函数
# 从旧系统 data_summary.R 提取的公共工具。

#' 判断字符串是否全大写 (用于物种检测)
#' 全大写 → 人类基因 (BRCA1), 首字母大写 → 小鼠基因 (Brca1)
#'
#' @param x 字符串
#' @return logical
is_upper_strict <- function(x) {
    !grepl("[a-z]", x)
}


#' 创建 Redis 进度报告函数
#' 替代旧系统的 Sys.sleep 假进度条。
#'
#' @param task_id 任务 UUID
#' @param redis_url Redis 连接 URL
#' @return function(pct, msg) 进度报告函数
create_progress_reporter <- function(task_id, redis_url = NULL) {
    if (is.null(redis_url)) {
        redis_url <- Sys.getenv("REDIS_URL", "redis://redis:6379")
    }

    # 尝试连接 Redis
    tryCatch({
        r <- redux::hiredis(url = redis_url)
        function(pct, msg) {
            r$PUBLISH(
                paste0("task:", task_id, ":progress"),
                jsonlite::toJSON(
                    list(progress = pct, message = msg, task_id = task_id),
                    auto_unbox = TRUE
                )
            )
        }
    }, error = function(e) {
        # Redis 不可用时降级为 console 输出
        message("Redis 不可用，进度将打印到 console: ", e$message)
        function(pct, msg) {
            message(sprintf("[%s] %d%% - %s", task_id, pct, msg))
        }
    })
}
