"""
Pipeline 执行引擎 — 顺序执行 8 个分析步骤。
"""

import logging
from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy.orm import Session

from app.db.models import Pipeline, Task, engine, SessionLocal
from app.utils.r_bridge import call_r_engine

logger = logging.getLogger(__name__)

PIPELINE_STEPS = ["qc", "normalize", "reduce", "cluster", "markers", "annotate"]


async def run_pipeline(pipeline_id: str) -> None:
    """
    顺序执行全流程 8 个步骤。每步完成后自动触发下一步。
    """
    db = SessionLocal()
    try:
        pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
        if not pipeline:
            logger.error(f"Pipeline {pipeline_id} not found")
            return

        logger.info(f"Starting pipeline {pipeline_id} for project {pipeline.project_id}")
        pipeline.status = "running"
        pipeline.started_at = datetime.utcnow()
        db.commit()

        for step in PIPELINE_STEPS:
            pipeline.current_step = step
            db.commit()

            logger.info(f"Pipeline {pipeline_id}: executing step {step}")

            try:
                # 普通步骤
                step_params = dict(pipeline.params.get(step, {}))

                # Step 5 markers 强制覆盖 cluster = "All"（运行前不知道 cluster 列表）
                if step == "markers":
                    step_params["cluster"] = "All"

                ok = await _execute_step(db, pipeline, step, step_params)
                if not ok:
                    return  # 失败，流程停止

            except Exception as e:
                logger.exception(f"Pipeline {pipeline_id}: error in step {step}: {e}")
                pipeline.status = "failed"
                pipeline.error_step = step
                pipeline.error_msg = str(e)
                db.commit()
                return

        # 全部完成
        pipeline.status = "completed"
        pipeline.completed_at = datetime.utcnow()
        pipeline.current_step = None
        db.commit()
        logger.info(f"Pipeline {pipeline_id} completed successfully")

    except Exception as e:
        logger.exception(f"Pipeline {pipeline_id} fatal error: {e}")
        try:
            pipeline.status = "failed"
            pipeline.error_msg = str(e)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


async def _execute_step(db: Session, pipeline: Pipeline, step: str, step_params: Dict[str, Any]) -> bool:
    """
    执行单个步骤，返回是否成功。
    """
    task_id = None
    try:
        # 创建 Task 记录
        from uuid import uuid4
        task_id = str(uuid4())
        task = Task(
            id=task_id,
            project_id=pipeline.project_id,
            user_id=pipeline.user_id,
            step=step,
            status="pending",
            params=step_params,
            pipeline_id=pipeline.id,
        )
        db.add(task)
        db.commit()

        # 调用 R 引擎（正确的函数签名）
        try:
            # 从 db 中获取 project 以获取 storage_path
            from app.db.models import Project
            project = db.query(Project).filter(Project.id == pipeline.project_id).first()
            if not project:
                raise Exception("Project not found")

            # 构造 payload（参考 tasks/router.py 的做法）
            payload = {
                "project_path": project.storage_path,
                "params": {
                    **(step_params or {}),
                    "task_id": task.id,
                },
            }

            await call_r_engine(
                endpoint=step,
                payload=payload,
                task=task,
                db=db,
            )
        except Exception as e:
            # call_r_engine 已更新 task.status = "failed" 和 task.error_msg
            db.refresh(task)
            pipeline.status = "failed"
            pipeline.error_step = step
            pipeline.error_msg = task.error_msg or str(e)
            db.commit()
            logger.error(f"Pipeline {pipeline.id}: step {step} failed: {pipeline.error_msg}")
            return False

        # 成功完成
        db.refresh(task)
        logger.info(f"Pipeline {pipeline.id}: step {step} completed successfully")
        return True

    except Exception as e:
        logger.exception(f"Pipeline {pipeline.id}: error executing step {step}: {e}")
        pipeline.status = "failed"
        pipeline.error_step = step
        pipeline.error_msg = str(e)
        db.commit()
        return False
