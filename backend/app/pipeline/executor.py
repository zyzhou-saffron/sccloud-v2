"""
Pipeline 执行引擎 — 分两阶段执行分析步骤。
Phase 1: qc → normalize → reduce → annotate（完成后暂停）
Phase 2: markers（用户确认后继续）
"""

import logging
from datetime import datetime
from typing import Dict, Any, List

from sqlalchemy.orm import Session

from app.db.models import Pipeline, Task, engine, SessionLocal
from app.utils.r_bridge import call_r_engine

logger = logging.getLogger(__name__)

PIPELINE_PHASE1 = ["qc", "normalize", "reduce", "annotate"]
PIPELINE_PHASE2 = ["markers"]
# reduce 步骤内部依次执行 reduce + cluster 两个 R 引擎端点


async def _run_steps(pipeline_id: str, steps: List[str], db: Session, pipeline: Pipeline) -> bool:
    """
    执行一组步骤，返回是否全部成功。
    """
    for step in steps:
        r_steps = [step]
        if step == "reduce":
            r_steps = ["reduce", "cluster"]

        for r_step in r_steps:
            pipeline.current_step = r_step
            db.commit()

            logger.info(f"Pipeline {pipeline_id}: executing step {r_step}")

            try:
                step_params = dict(pipeline.params.get(r_step, {}))

                # markers 强制覆盖 cluster = "All"（运行前不知道 cluster 列表）
                if r_step == "markers":
                    step_params["cluster"] = "All"
                    step_params["group_by"] = "CellType"

                ok = await _execute_step(db, pipeline, r_step, step_params)
                if not ok:
                    return False

            except Exception as e:
                logger.exception(f"Pipeline {pipeline_id}: error in step {r_step}: {e}")
                pipeline.status = "failed"
                pipeline.error_step = r_step
                pipeline.error_msg = str(e)
                db.commit()
                return False
    return True


async def run_pipeline(pipeline_id: str) -> None:
    """
    执行 Phase 1（qc → annotate），完成后暂停等待用户确认。
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

        ok = await _run_steps(pipeline_id, PIPELINE_PHASE1, db, pipeline)
        if not ok:
            return  # 失败，流程停止

        # Phase 1 完成，暂停
        pipeline.status = "paused"
        pipeline.current_step = None
        db.commit()
        logger.info(f"Pipeline {pipeline_id} paused after annotation (Phase 1 complete)")

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


async def resume_pipeline(pipeline_id: str) -> None:
    """
    从 Phase 2（markers）继续执行，直到全部完成。
    """
    db = SessionLocal()
    try:
        pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
        if not pipeline:
            logger.error(f"Pipeline {pipeline_id} not found")
            return

        logger.info(f"Resuming pipeline {pipeline_id}")
        pipeline.status = "running"
        db.commit()

        ok = await _run_steps(pipeline_id, PIPELINE_PHASE2, db, pipeline)
        if not ok:
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
