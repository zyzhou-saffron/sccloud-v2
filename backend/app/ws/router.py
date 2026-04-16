"""
scCloud v2 — WebSocket 路由
前端通过 ws://host/ws/tasks/{task_id} 订阅实时进度。
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import manager

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/tasks/{task_id}")
async def task_progress_ws(websocket: WebSocket, task_id: str):
    """
    WebSocket 端点 — 实时接收分析任务进度。

    前端用法:
        const ws = new WebSocket(`ws://host/ws/tasks/${taskId}`);
        ws.onmessage = (e) => {
            const { progress, message } = JSON.parse(e.data);
            setProgress(progress);
            setMessage(message);
        };
    """
    await manager.connect(websocket, task_id)
    try:
        # 保持连接直到客户端断开
        while True:
            # 接收客户端心跳 (可选)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, task_id)
