#!/usr/bin/env python3
"""
1. 恢复 TaskHistory.tsx（去掉全局过滤）
2. 在 page.tsx 中过滤单步分析页面的历史任务
"""

# 1. 恢复 TaskHistory.tsx
path1 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/frontend/src/app/components/TaskHistory.tsx'
with open(path1, 'r') as f:
    content1 = f.read()

old_filter = '''        // 过滤掉 pipeline-only 的步骤（只在全流程分析中出现）
        const PIPELINE_ONLY_STEPS = ["wgcna", "enrich", "monocle", "cellchat", "infercnv"];
        filtered = filtered.filter((t) => !PIPELINE_ONLY_STEPS.includes(t.step));
        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

new_filter = '''        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

if old_filter in content1:
    content1 = content1.replace(old_filter, new_filter)
    print('Restored TaskHistory')
else:
    print('Filter not found in TaskHistory')

with open(path1, 'w') as f:
    f.write(content1)

# 2. 在 page.tsx 中单步分析模式下过滤历史任务
path2 = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/frontend/src/app/dashboard/analysis/page.tsx'
with open(path2, 'r') as f:
    content2 = f.read()

# 找到单步分析模式下的 TaskHistory 调用
old_history = '''          {project && (
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--clr-border)" }}>
              <TaskHistory projectId={project.id} onSelect={handleSelectHistory} />
            </div>
          )}'''

new_history = '''          {project && (
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--clr-border)" }}>
              <TaskHistory
                projectId={project.id}
                onSelect={handleSelectHistory}
                excludeSteps={["wgcna", "enrich", "monocle", "cellchat", "infercnv"]}
              />
            </div>
          )}'''

if old_history in content2:
    content2 = content2.replace(old_history, new_history)
    print('Added excludeSteps to single-step TaskHistory')
else:
    print('TaskHistory call pattern not found in page.tsx')

# 3. 修改 TaskHistory 组件支持 excludeSteps
old_props = '''interface TaskHistoryProps {
  /** 项目 ID */
  projectId: number | null;
  /** 仅显示特定步骤 */
  step?: string;
  /** 点击任务时回调 */
  onSelect?: (task: Task) => void;
}'''

new_props = '''interface TaskHistoryProps {
  /** 项目 ID */
  projectId: number | null;
  /** 仅显示特定步骤 */
  step?: string;
  /** 排除的步骤 */
  excludeSteps?: string[];
  /** 点击任务时回调 */
  onSelect?: (task: Task) => void;
}'''

with open(path1, 'r') as f:
    content1 = f.read()

if old_props in content1:
    content1 = content1.replace(old_props, new_props)
    print('Added excludeSteps prop')
else:
    print('Props pattern not found')

# 4. 修改 TaskHistory 使用 excludeSteps
old_use = '''        let filtered = data.tasks;
        if (step) {
          filtered = filtered.filter((t) => t.step === step);
        }
        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

new_use = '''        let filtered = data.tasks;
        if (step) {
          filtered = filtered.filter((t) => t.step === step);
        }
        if (excludeSteps && excludeSteps.length > 0) {
          filtered = filtered.filter((t) => !excludeSteps.includes(t.step));
        }
        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));'''

if old_use in content1:
    content1 = content1.replace(old_use, new_use)
    print('Applied excludeSteps filtering')
else:
    print('Use pattern not found')

# 5. 更新组件签名
old_sig = '''export default function TaskHistory({
  projectId,
  step,
  onSelect,
}: TaskHistoryProps) {'''

new_sig = '''export default function TaskHistory({
  projectId,
  step,
  excludeSteps,
  onSelect,
}: TaskHistoryProps) {'''

if old_sig in content1:
    content1 = content1.replace(old_sig, new_sig)
    print('Updated component signature')

with open(path1, 'w') as f:
    f.write(content1)

with open(path2, 'w') as f:
    f.write(content2)

print('Done')
