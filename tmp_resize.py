#!/usr/bin/env python3
"""
在 PipelineView.tsx 中添加左右面板拖拽调整宽度功能
"""

path = '/data1/home/zhouy1/Projects/scRNA/sccloud-v2/frontend/src/app/dashboard/analysis/components/PipelineView.tsx'
with open(path, 'r') as f:
    content = f.read()

# 1. 添加 sidebarWidth state（在组件顶部，其他 state 附近）
old_state = '''  const [showPhase2Param, setShowPhase2Param] = useState(false);'''
new_state = '''  const [showPhase2Param, setShowPhase2Param] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224); // 左侧导航栏宽度，默认 224px (w-56)
  const isResizing = useRef(false);'''

if old_state in content:
    content = content.replace(old_state, new_state)
    print('Added sidebarWidth state')

# 2. 添加拖拽事件处理（在组件函数内）
old_drag = '''  const userSelectedRef = useRef(false);'''
new_drag = '''  const userSelectedRef = useRef(false);

  // 拖拽调整面板宽度
  const startResize = () => { isResizing.current = true; };
  const stopResize = () => { isResizing.current = false; };
  const doResize = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX - 32; // 减去左边距
    if (newWidth >= 180 && newWidth <= 400) {
      setSidebarWidth(newWidth);
    }
  };
  useEffect(() => {
    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", doResize);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);'''

if old_drag in content:
    content = content.replace(old_drag, new_drag)
    print('Added resize handlers')

# 3. 修改左侧导航栏宽度为动态
old_sidebar = '''        {/* ── 左侧导航（sticky 固定） ── */}
        <div className="w-56 shrink-0 space-y-1 sticky top-4 self-start">'''
new_sidebar = '''        {/* ── 左侧导航（sticky 固定） ── */}
        <div className="shrink-0 space-y-1 sticky top-4 self-start" style={{ width: sidebarWidth }}>'''

if old_sidebar in content:
    content = content.replace(old_sidebar, new_sidebar)
    print('Changed sidebar to dynamic width')

# 4. 在左侧导航和右侧内容之间添加拖拽条
old_gap = '''        </div>

        {/* ── 右侧内容区 ── */}
        <div className="flex-1 min-w-0">'''
new_gap = '''        </div>

        {/* 拖拽条 */}
        <div
          onMouseDown={startResize}
          className="w-1 cursor-col-resize shrink-0 self-stretch opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: "var(--clr-border)" }}
          title="拖拽调整面板宽度"
        />

        {/* ── 右侧内容区 ── */}
        <div className="flex-1 min-w-0">'''

if old_gap in content:
    content = content.replace(old_gap, new_gap)
    print('Added resize handle')

with open(path, 'w') as f:
    f.write(content)

print('Resizable panel added')
