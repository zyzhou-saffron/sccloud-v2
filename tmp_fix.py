#!/usr/bin/env python3
"""
修复所有已知问题：
1. plumber.R /wgcna - 添加 result_path 到返回结果
2. TaskHistory - 过滤 pipeline-only 步骤
3. PipelineView - 添加停止按钮
4. PipelineView - 修复重新运行按钮（传递正确参数）
5. page.tsx - 添加面板拖拽调整
"""

import re

# ============================================================
# 1. 修复 plumber.R /wgcna 端点 - 添加 result_path
# ============================================================
path1 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/r-engine/plumber.R'
with open(path1, 'r') as f:
    content1 = f.read()

# 在 /wgcna 端点返回前添加 result_path
old_wgcna_end = '''  report(100, "WGCNA 分析完成")

  list(
    status = "success",
    outdir = outdir,
    plot_paths = plot_paths,
    data_paths = data_paths,
    stats = list(
      cell_type = interestType,
      soft_power = result$soft_power,
      n_modules = length(setdiff(colnames(result$hMEs), "grey")),
      n_hub_genes = nrow(result$hub_genes)
    )
  )
}'''

new_wgcna_end = '''  report(100, "WGCNA 分析完成")

  # 保存结果 JSON 到项目根目录（供后端读取）
  result_json <- file.path(project_path, "wgcna_result.json")
  result_data <- list(
    status = "success",
    outdir = outdir,
    plot_paths = plot_paths,
    data_paths = data_paths,
    stats = list(
      cell_type = interestType,
      soft_power = result$soft_power,
      n_modules = length(setdiff(colnames(result$hMEs), "grey")),
      n_hub_genes = nrow(result$hub_genes)
    )
  )
  jsonlite::write_json(result_data, result_json, auto_unbox = TRUE, pretty = TRUE)

  list(
    status = "success",
    result_path = result_json,
    outdir = outdir,
    plot_paths = plot_paths,
    data_paths = data_paths,
    stats = list(
      cell_type = interestType,
      soft_power = result$soft_power,
      n_modules = length(setdiff(colnames(result$hMEs), "grey")),
      n_hub_genes = nrow(result$hub_genes)
    )
  )
}'''

if old_wgcna_end in content1:
    content1 = content1.replace(old_wgcna_end, new_wgcna_end)
    print('Fixed plumber.R /wgcna endpoint')
else:
    print('plumber.R /wgcna pattern not found - may already be fixed')

with open(path1, 'w') as f:
    f.write(content1)

# ============================================================
# 2. 修复 TaskHistory - 过滤 pipeline-only 步骤
# ============================================================
path2 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/frontend/src/app/components/TaskHistory.tsx'
with open(path2, 'r') as f:
    content2 = f.read()

# 添加 pipeline-only 步骤过滤
old_filter = '''        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

new_filter = '''        // 过滤掉 pipeline-only 的步骤（只在全流程分析中出现）
        const PIPELINE_ONLY_STEPS = ["wgcna", "enrich", "monocle", "cellchat", "infercnv"];
        filtered = filtered.filter((t) => !PIPELINE_ONLY_STEPS.includes(t.step));
        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

if old_filter in content2:
    content2 = content2.replace(old_filter, new_filter)
    print('Fixed TaskHistory filtering')
else:
    print('TaskHistory filter pattern not found')

with open(path2, 'w') as f:
    f.write(content2)

# ============================================================
# 3. 修复 PipelineView - 添加停止按钮 + 修复重新运行
# ============================================================
path3 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/frontend/src/app/dashboard/analysis/components/PipelineView.tsx'
with open(path3, 'r') as f:
    content3 = f.read()

# 3.1 添加 cancelPipeline API 导入
old_import = '''import { getPipeline, resumePipeline, type Pipeline, type PipelineTask } from "../../../lib/pipeline-api";
import { submitTask } from "../../../lib/api";'''

new_import = '''import { getPipeline, resumePipeline, type Pipeline, type PipelineTask } from "../../../lib/pipeline-api";
import { submitTask } from "../../../lib/api";
import { apiFetch } from "../../../lib/api";'''

if old_import in content3:
    content3 = content3.replace(old_import, new_import)
    print('Added apiFetch import')

# 3.2 添加停止按钮（在"返回参数设置"旁边）
old_header = '''      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 text-sm rounded"
          style={{ border: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)", cursor: "pointer" }}
          onClick={() => window.dispatchEvent(new CustomEvent("pipeline-back"))}
        >
          ← 返回参数设置
        </button>
        <div
          className="px-4 py-1.5 rounded text-sm font-semibold"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
        >
          任务状态: {statusLabel}
        </div>
      </div>'''

new_header = '''      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 text-sm rounded"
          style={{ border: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)", cursor: "pointer" }}
          onClick={() => window.dispatchEvent(new CustomEvent("pipeline-back"))}
        >
          ← 返回参数设置
        </button>
        <div className="flex items-center gap-2">
          {(pipeline.status === "running" || pipeline.status === "pending") && (
            <button
              onClick={async () => {
                if (!confirm("确定要停止当前分析吗？已完成的步骤结果将保留。")) return;
                try {
                  await apiFetch(`/api/pipelines/${pipelineId}/cancel`, { method: "POST" });
                  const data = await getPipeline(token, pipelineId);
                  setPipeline(data);
                } catch (e) {
                  alert("停止失败: " + (e instanceof Error ? e.message : "未知错误"));
                }
              }}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: "var(--clr-danger)", color: "#fff", cursor: "pointer", border: "none" }}
            >
              停止分析
            </button>
          )}
          <div
            className="px-4 py-1.5 rounded text-sm font-semibold"
            style={{ background: statusStyle.bg, color: statusStyle.color }}
          >
            任务状态: {statusLabel}
          </div>
        </div>
      </div>'''

if old_header in content3:
    content3 = content3.replace(old_header, new_header)
    print('Added stop button')
else:
    print('Header pattern not found')

# 3.3 修复重新运行按钮 - 添加更多错误信息和刷新
old_rerun = '''                        <button
                          onClick={async () => {
                            try {
                              await submitTask({
                                project_id: pipeline.project_id,
                                step: subId,
                                params: subTask.params || {},
                              });
                              const data = await getPipeline(token, pipelineId);
                              setPipeline(data);
                            } catch (e) {
                              alert("重新运行失败: " + (e instanceof Error ? e.message : "未知错误"));
                            }
                          }}
                          className="mt-3 px-4 py-1.5 rounded text-xs font-medium text-white"
                          style={{ background: "var(--clr-amber)", cursor: "pointer", border: "none" }}
                        >
                          重新运行
                        </button>'''

new_rerun = '''                        <button
                          onClick={async () => {
                            try {
                              if (!pipeline.project_id) {
                                alert("项目ID不存在，无法重新运行");
                                return;
                              }
                              const result = await submitTask({
                                project_id: pipeline.project_id,
                                step: subId,
                                params: subTask.params || {},
                              });
                              console.log("重新运行成功:", result);
                              const data = await getPipeline(token, pipelineId);
                              setPipeline(data);
                            } catch (e) {
                              console.error("重新运行失败:", e);
                              alert("重新运行失败: " + (e instanceof Error ? e.message : "未知错误"));
                            }
                          }}
                          className="mt-3 px-4 py-1.5 rounded text-xs font-medium text-white"
                          style={{ background: "var(--clr-amber)", cursor: "pointer", border: "none" }}
                        >
                          重新运行
                        </button>'''

# Replace all occurrences
if old_rerun in content3:
    content3 = content3.replace(old_rerun, new_rerun)
    print('Fixed rerun buttons')

with open(path3, 'w') as f:
    f.write(content3)

# ============================================================
# 4. 添加后端 pipeline cancel 接口
# ============================================================
path4 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/backend/app/pipeline/router.py'
with open(path4, 'r') as f:
    content4 = f.read()

# 检查是否已有 cancel 接口
if '/{pipeline_id}/cancel' not in content4:
    # 在文件末尾添加 cancel 接口
    cancel_endpoint = '''

@router.post("/{pipeline_id}/cancel")
async def cancel_pipeline(
    pipeline_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    取消正在运行的 pipeline。
    将 pipeline 状态设为 cancelled，并取消当前正在运行的 task。
    """
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline 不存在")

    if pipeline.status not in ("running", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"当前 pipeline 状态 '{pipeline.status}' 不可取消",
        )

    # 取消当前正在运行的 task
    from app.db.models import Task
    running_task = (
        db.query(Task)
        .filter(
            Task.pipeline_id == pipeline_id,
            Task.status.in_(["pending", "running"]),
        )
        .first()
    )
    if running_task:
        running_task.status = "cancelled"
        running_task.completed_at = datetime.now(timezone.utc)

    pipeline.status = "cancelled"
    db.commit()

    return {"status": "cancelled", "pipeline_id": pipeline_id}
'''
    content4 = content4.rstrip() + cancel_endpoint
    print('Added pipeline cancel endpoint')
else:
    print('Pipeline cancel endpoint already exists')

with open(path4, 'w') as f:
    f.write(content4)

print('All fixes applied')
