"""
scCloud v2 — 项目路由
项目 CRUD 操作，替代旧系统中 app-new.R 的 observeEvent(input$confirmProject)。
"""

import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import get_settings
from app.db.models import Project, User, get_db

router = APIRouter(prefix="/api/projects", tags=["项目管理"])


# ===== Schemas =====

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    species: str = "human"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """
        项目名称校验 — 防止路径穿越攻击。
        旧系统无此校验，用户可输入 '../../etc/passwd' 作为项目名。
        """
        if re.search(r'[/\\<>:"|?*\x00-\x1f]', v):
            raise ValueError("项目名称包含非法字符")
        if v.startswith(".") or ".." in v:
            raise ValueError("项目名称不能以 . 开头或包含 ..")
        return v.strip()

    @field_validator("species")
    @classmethod
    def validate_species(cls, v: str) -> str:
        if v not in ("human", "mouse"):
            raise ValueError("species 必须是 human 或 mouse")
        return v


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    species: str
    status: str
    storage_path: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectList(BaseModel):
    total: int
    projects: list[ProjectResponse]


# ===== 路由 =====

@router.get("", response_model=ProjectList)
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的所有项目。"""
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    return ProjectList(total=len(projects), projects=projects)


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    req: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    创建项目。
    旧系统中此操作会被正在运行的分析任务阻塞 (BUG-T3)，
    新系统中完全异步，互不影响。
    """
    settings = get_settings()

    # 检查项目数量限制
    project_count = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .count()
    )
    if project_count >= current_user.max_projects:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"已达项目上限 ({current_user.max_projects})",
        )

    # 检查同名项目
    existing = (
        db.query(Project)
        .filter(
            Project.user_id == current_user.id,
            Project.name == req.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="同名项目已存在",
        )

    # 创建存储目录 (安全的路径拼接)
    storage_path = os.path.join(
        settings.projects_root,
        str(current_user.id),
        req.name,
    )
    os.makedirs(storage_path, exist_ok=True)
    # R 引擎容器以 rengine 用户运行，需要写权限
    os.chmod(storage_path, 0o777)

    project = Project(
        name=req.name,
        user_id=current_user.id,
        description=req.description,
        species=req.species,
        storage_path=storage_path,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单个项目详情。"""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除项目。"""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    db.delete(project)
    db.commit()


@router.get("/{project_id}/genes")
async def get_project_genes(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取项目 Seurat 对象中所有可用基因名称。
    用于前端基因自动补全搜索。
    """
    import httpx

    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        ) as client:
            response = await client.post(
                f"{settings.r_engine_url}/genes",
                json={"project_path": project.storage_path},
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"R 引擎返回错误: {response.text}",
            )
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="R 引擎超时，请稍后重试",
        )
