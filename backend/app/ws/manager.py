"""
scCloud v2 — WebSocket 连接管理器
通过 Redis PubSub 接收 R 引擎的进度消息，推送到前端。
替代旧系统的 Sys.sleep 假进度条 (BUG-T1)。
"""

import asyncio
import json
from typing import Dict, Set

import redis.asyncio as aioredis
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.config import get_settings


class ConnectionManager:
    """
    WebSocket 连接管理器。

    架构:
    R 引擎 --PUBLISH--> Redis --SUBSCRIBE--> FastAPI --WS--> 前端

    旧系统架构 (对比):
    R 计算 --> Sys.sleep 循环 --> 假进度条 (同一线程)
    """

    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._redis: aioredis.Redis | None = None
        self._subscriber_task: asyncio.Task | None = None

    async def _get_redis(self) -> aioredis.Redis:
        """获取或创建 Redis 异步连接。"""
        if self._redis is None:
            settings = get_settings()
            self._redis = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
        return self._redis

    async def connect(self, websocket: WebSocket, task_id: str):
        """
        接受 WebSocket 连接并绑定到 task_id。
        前端连接: ws://host/ws/tasks/{task_id}
        """
        await websocket.accept()
        if task_id not in self._connections:
            self._connections[task_id] = set()
        self._connections[task_id].add(websocket)

        # 启动 Redis 订阅 (如果还没启动)
        if self._subscriber_task is None or self._subscriber_task.done():
            self._subscriber_task = asyncio.create_task(
                self._redis_subscriber()
            )

    def disconnect(self, websocket: WebSocket, task_id: str):
        """断开 WebSocket 连接。"""
        if task_id in self._connections:
            self._connections[task_id].discard(websocket)
            if not self._connections[task_id]:
                del self._connections[task_id]

    async def send_progress(self, task_id: str, data: dict):
        """向指定 task 的所有连接推送进度。"""
        if task_id not in self._connections:
            return

        dead_connections = set()
        for ws in self._connections[task_id]:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_json(data)
                else:
                    dead_connections.add(ws)
            except Exception:
                dead_connections.add(ws)

        # 清理断开的连接
        for ws in dead_connections:
            self._connections[task_id].discard(ws)

    async def _redis_subscriber(self):
        """
        Redis PubSub 订阅者。
        监听 task:*:progress 频道，将消息推送到对应的 WebSocket。

        R 引擎通过 redux::PUBLISH 发送:
        {
            "task_id": "uuid",
            "progress": 42,
            "message": "运行 SCTransform..."
        }
        """
        try:
            r = await self._get_redis()
            pubsub = r.pubsub()
            await pubsub.psubscribe("task:*:progress")

            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue

                try:
                    data = json.loads(message["data"])
                    task_id = data.get("task_id", "")
                    await self.send_progress(task_id, data)
                except (json.JSONDecodeError, KeyError):
                    continue

        except Exception as e:
            # Redis 断开时降级，不影响其他功能
            print(f"[WebSocket] Redis subscriber error: {e}")
            await asyncio.sleep(5)
            # 重试
            self._subscriber_task = asyncio.create_task(
                self._redis_subscriber()
            )


# 全局单例
manager = ConnectionManager()
