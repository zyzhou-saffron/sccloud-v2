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

PIPELINE_STEPS = ["qc", "normalize", "reduce", "cluster", "markers", "enrich", "marker_expr", "annotate"]


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
                # 特殊处理 marker_expr：Phase A 已在 create_pipeline 时解析，这里对每个 cell_type 跑 Phase B
                if step == "marker_expr":
                    cell_types = pipeline.params.get("marker_expr", {}).get("cell_types", [])
                    if not cell_types:
                        # 没有 marker 文件或解析失败，跳过 marker_expr
                        logger.warning(f"Pipeline {pipeline_id}: no cell_types for marker_expr, skipping")
                        continue

                    for cell_type in cell_types:
                        step_params = {
                            **pipeline.params.get("marker_expr", {}),
                            "cell_type": cell_type
                        }
                        ok = await _execute_step(db, pipeline, step, step_params)
                        if not ok:
                            return  # 失败，流程停止

                else:
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

        # 调用 R 引擎
        success = await call_r_engine(task)

        # 刷新 task 状态（r_bridge 会更新数据库）
        db.refresh(task)

        if not success:
            pipeline.status = "failed"
            pipeline.error_step = step
            pipeline.error_msg = task.error_msg or f"Step {step} failed"
            db.commit()
            logger.error(f"Pipeline {pipeline.id}: step {step} failed: {pipeline.error_msg}")
            return False

        logger.info(f"Pipeline {pipeline.id}: step {step} completed successfully")
        return True

    except Exception as e:
        logger.exception(f"Pipeline {pipeline.id}: error executing step {step}: {e}")
        pipeline.status = "failed"
        pipeline.error_step = step
        pipeline.error_msg = str(e)
        db.commit()
        return False
