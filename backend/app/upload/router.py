"""
scCloud v2 — 分片上传路由
支持大文件 (>1GB RDS/H5AD) 的断点续传。

流程:
  1. POST /api/upload/init → 获取 upload_id
  2. POST /api/upload/chunk → 逐片上传 (每片 5MB)
  3. POST /api/upload/complete → 合并所有分片

前端使用 File.slice() 分割文件，并行/顺序上传每一片。
"""

import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.auth.deps import get_current_user
from app.config import get_settings
from app.db.models import User

router = APIRouter(prefix="/api/upload", tags=["文件上传"])

# 临时分片存储目录
CHUNK_DIR = "/tmp/sccloud_chunks"


class InitUploadResponse(BaseModel):
    upload_id: str
    chunk_size: int


class ChunkResponse(BaseModel):
    upload_id: str
    chunk_index: int
    received: int


class CompleteUploadResponse(BaseModel):
    status: str
    path: str
    filename: str
    size_mb: float
    total_chunks: int


@router.post("/init", response_model=InitUploadResponse)
async def init_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    current_user: User = Depends(get_current_user),
):
    """
    初始化分片上传 — 返回 upload_id 用于后续分片标识。
    默认分片大小 5MB，前端据此切分文件。
    """
    # 验证文件类型
    allowed_ext = {".rds", ".h5seurat", ".h5ad", ".h5", ".rdata"}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(allowed_ext)}",
        )

    # 检查大小限制 (默认 30GB)
    settings = get_settings()
    max_bytes = settings.max_upload_size_gb * 1024 * 1024 * 1024
    if file_size > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大 ({file_size / 1e9:.1f}GB)，"
                   f"上限 {settings.max_upload_size_gb}GB",
        )

    upload_id = uuid.uuid4().hex
    chunk_dir = os.path.join(CHUNK_DIR, upload_id)
    os.makedirs(chunk_dir, exist_ok=True)

    # 保存元数据
    meta_path = os.path.join(chunk_dir, "_meta.txt")
    with open(meta_path, "w") as f:
        f.write(f"{filename}\n{file_size}\n{current_user.id}\n")

    chunk_size = 5 * 1024 * 1024  # 5MB

    return InitUploadResponse(upload_id=upload_id, chunk_size=chunk_size)


@router.post("/chunk", response_model=ChunkResponse)
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    上传单个分片。
    前端使用 File.slice(start, end) 切片后逐个上传。
    """
    chunk_dir = os.path.join(CHUNK_DIR, upload_id)
    if not os.path.exists(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload ID 不存在")

    # 保存分片
    chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index:06d}")
    content = await chunk.read()

    with open(chunk_path, "wb") as f:
        f.write(content)

    return ChunkResponse(
        upload_id=upload_id,
        chunk_index=chunk_index,
        received=len(content),
    )


@router.post("/complete", response_model=CompleteUploadResponse)
async def complete_upload(
    upload_id: str = Form(...),
    project_id: int = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    合并所有分片为完整文件。
    合并后清理临时分片目录。
    """
    from app.db.models import Project, SessionLocal

    settings = get_settings()
    chunk_dir = os.path.join(CHUNK_DIR, upload_id)

    if not os.path.exists(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload ID 不存在")

    # 读取元数据
    meta_path = os.path.join(chunk_dir, "_meta.txt")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=400, detail="上传元数据丢失")

    with open(meta_path, "r") as f:
        lines = f.readlines()
        original_filename = lines[0].strip()

    # 确定最终存储路径 — 使用项目的 storage_path 保持一致
    if project_id:
        db = SessionLocal()
        try:
            project = (
                db.query(Project)
                .filter(
                    Project.id == project_id,
                    Project.user_id == current_user.id,
                )
                .first()
            )
            if not project:
                raise HTTPException(status_code=404, detail="项目不存在")
            dest_dir = project.storage_path
        finally:
            db.close()
    else:
        dest_dir = os.path.join(
            settings.projects_root,
            str(current_user.id),
            "_uploads",
        )
    os.makedirs(dest_dir, exist_ok=True)
    os.chmod(dest_dir, 0o777)

    # 生成唯一文件名
    ext = os.path.splitext(original_filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex[:8]}_{original_filename}"
    final_path = os.path.join(dest_dir, safe_name)

    # 按序合并分片
    chunk_files = sorted(
        [f for f in os.listdir(chunk_dir) if f.startswith("chunk_")]
    )

    if not chunk_files:
        raise HTTPException(status_code=400, detail="没有分片数据")

    total_size = 0
    with open(final_path, "wb") as out:
        for cf in chunk_files:
            chunk_path = os.path.join(chunk_dir, cf)
            with open(chunk_path, "rb") as inp:
                data = inp.read()
                out.write(data)
                total_size += len(data)

    # 清理临时目录
    shutil.rmtree(chunk_dir, ignore_errors=True)

    return CompleteUploadResponse(
        status="completed",
        path=final_path,
        filename=original_filename,
        size_mb=round(total_size / 1024 / 1024, 2),
        total_chunks=len(chunk_files),
    )


@router.get("/status/{upload_id}")
async def upload_status(
    upload_id: str,
    current_user: User = Depends(get_current_user),
):
    """查询上传进度 — 返回已接收的分片数量。"""
    chunk_dir = os.path.join(CHUNK_DIR, upload_id)
    if not os.path.exists(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload ID 不存在")

    chunk_files = [f for f in os.listdir(chunk_dir) if f.startswith("chunk_")]

    return {
        "upload_id": upload_id,
        "received_chunks": len(chunk_files),
    }
