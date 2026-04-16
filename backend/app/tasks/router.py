"""
scCloud v2 — 任务管理路由
所有分析步骤通过此模块提交、查询、取消。
替代旧系统中 app-new.R 的 observeEvent(input$button1~8)。
"""

import asyncio
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Project, Task, User, get_db
from app.utils.r_bridge import call_r_engine, create_task

router = APIRouter(prefix="/api/tasks", tags=["任务管理"])


# ===== Schemas =====

class TaskSubmit(BaseModel):
    """提交分析任务。"""
    project_id: int
    step: str = Field(
        ...,
        pattern=r"^(qc|normalize|reduce|cluster|markers|enrich|annotate|convert|markers_pairwise|plot_markers)$",
    )
    params: dict = Field(default_factory=dict)


class TaskResponse(BaseModel):
    id: str
    project_id: int
    step: str
    status: str
    progress: int
    params: dict | None
    result_path: str | None
    error_msg: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    total: int
    tasks: list[TaskResponse]


# ===== 后台任务执行函数 =====

async def _run_task_background(task_id: str, step: str, payload: dict):
    """
    后台执行分析任务。
    使用独立的数据库 session，避免请求 session 过早关闭。
    """
    from app.db.models import SessionLocal

    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return

        await call_r_engine(
            endpoint=step,
            payload=payload,
            task=task,
            db=db,
        )
    except Exception as e:
        # 确保失败时更新状态
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status != "failed":
            task.status = "failed"
            task.error_msg = str(e)[:1000]
            db.commit()
    finally:
        db.close()


# ===== 路由 =====

@router.post("", response_model=TaskResponse, status_code=201)
async def submit_task(
    req: TaskSubmit,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    提交分析任务。

    与旧系统的区别:
    - 旧: 点击 button1~8 → 同步执行 → UI 完全阻塞 (BUG-T3)
    - 新: 提交任务 → 立刻返回 task_id → 后台异步执行
           → 前端通过 WebSocket 实时接收进度 (BUG-T1 修复)
           → 任务状态持久化到 tasks 表 (BUG-T2 修复)
    """
    # 验证项目归属
    project = (
        db.query(Project)
        .filter(
            Project.id == req.project_id,
            Project.user_id == current_user.id,
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查是否有同步骤的进行中任务
    existing = (
        db.query(Task)
        .filter(
            Task.project_id == req.project_id,
            Task.step == req.step,
            Task.status.in_(["pending", "running"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"该步骤已有任务在运行中 (ID: {existing.id})",
        )

    # 创建任务记录
    task = create_task(
        db=db,
        project_id=req.project_id,
        user_id=current_user.id,
        step=req.step,
        params=req.params,
    )

    # ── 自动清理：每步骤只保留最近 20 条已完成/失败/取消的任务 ──
    MAX_HISTORY = 20
    old_tasks = (
        db.query(Task)
        .filter(
            Task.project_id == req.project_id,
            Task.step == req.step,
            Task.status.in_(["completed", "failed", "cancelled"]),
        )
        .order_by(Task.created_at.desc())
        .all()
    )
    if len(old_tasks) >= MAX_HISTORY:
        # 删除超出上限的最旧记录（保留 MAX_HISTORY - 1 条，给新任务留位置）
        to_delete = old_tasks[MAX_HISTORY - 1 :]
        for t in to_delete:
            db.delete(t)
        db.commit()

    # 构造 R 引擎调用参数
    payload = {
        "project_path": project.storage_path,
        "params": {
            **(req.params or {}),
            "task_id": task.id,
        },
    }

    # 后台异步执行 — 不阻塞请求响应
    background_tasks.add_task(
        _run_task_background,
        task_id=task.id,
        step=req.step,
        payload=payload,
    )

    return task


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    project_id: int | None = None,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    查询任务列表。
    支持按 project_id 和 status 筛选。
    刷新页面后调用此接口恢复状态 (BUG-T2 修复核心)。
    """
    query = db.query(Task).filter(Task.user_id == current_user.id)

    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    if status is not None:
        query = query.filter(Task.status == status)

    tasks = query.order_by(Task.created_at.desc()).all()
    return TaskListResponse(total=len(tasks), tasks=tasks)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单个任务详情。"""
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.get("/{task_id}/result")
async def get_task_result(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取任务的详细分析结果数据 (JSON)。
    R 引擎完成后，结果保存在 {project_path}/{step}_result.json。
    """
    import json
    import os

    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status != "completed":
        raise HTTPException(status_code=400, detail="任务尚未完成")

    # 获取项目路径
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    result_file = os.path.join(project.storage_path, f"{task.step}_result.json")
    if not os.path.exists(result_file):
        raise HTTPException(status_code=404, detail="结果文件不存在")

    with open(result_file, "r") as f:
        return json.load(f)


@router.get("/{task_id}/plot")
async def get_task_plot(
    task_id: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    提供任务输出文件（PNG 图 / CSV 表）。
    R 引擎生成的 ggplot2 图片通过此端点直接返回给前端展示。

    参数:
        name: 文件名（如 plot_enrich_GO_Up.png / enrich_GO_Up.csv）
    """
    import os
    from fastapi.responses import FileResponse

    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    project = db.query(Project).filter(Project.id == task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 安全检查：只允许 plot_*.png 和 *.csv 文件，防止目录穿越
    safe_extensions = {".png", ".csv", ".pdf", ".rds"}
    ext = os.path.splitext(name)[1].lower()
    if ext not in safe_extensions or ".." in name or "/" in name:
        raise HTTPException(status_code=400, detail="不支持的文件类型或路径")

    file_path = os.path.join(project.storage_path, name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"文件 {name} 不存在")

    if ext == ".png": media_type = "image/png"
    elif ext == ".csv": media_type = "text/csv"
    elif ext == ".pdf": media_type = "application/pdf"
    elif ext == ".rds": media_type = "application/octet-stream"
    else: media_type = "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=name)


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取消任务 (仅 pending 状态可取消)。"""
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status not in ("pending",):
        raise HTTPException(
            status_code=400,
            detail=f"当前状态 '{task.status}' 不可取消",
        )

    task.status = "cancelled"
    db.commit()
    db.refresh(task)
    return task
