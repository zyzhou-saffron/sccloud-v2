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


class InspectResponse(BaseModel):
    """文件解析结果"""
    filename: str
    n_rows: int  # 细胞数 (行)
    n_cols: int  # 基因数 (列)
    genes: list[str]  # 基因名列表
    gene_ids: list[str]  # Ensemble ID 列表
    file_size_mb: float
    metadata_columns: list[str] = []  # 元数据列名（Sample, Group, CellType 等）


@router.post("/inspect", response_model=InspectResponse)
async def inspect_file(
    upload_id: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """
    解析已上传的文件，返回维度信息和基因名。
    支持 .rds, .h5ad, .h5seurat 格式。
    """
    import subprocess
    import tempfile

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

    # 合并分片到临时文件
    chunk_files = sorted(
        [f for f in os.listdir(chunk_dir) if f.startswith("chunk_")]
    )

    if not chunk_files:
        raise HTTPException(status_code=400, detail="没有分片数据")

    # 创建临时文件
    ext = os.path.splitext(original_filename)[1].lower()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
        tmp_path = tmp_file.name
        for cf in chunk_files:
            chunk_path = os.path.join(chunk_dir, cf)
            with open(chunk_path, "rb") as inp:
                tmp_file.write(inp.read())

    try:
        # 根据文件类型调用不同的解析器
        if ext in [".rds", ".rdata", ".h5seurat"]:
            result = _parse_rds_file(tmp_path, original_filename)
        elif ext == ".h5ad":
            result = _parse_h5ad_file(tmp_path, original_filename)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")

        return result

    finally:
        # 清理临时文件
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _parse_rds_file(file_path: str, filename: str) -> InspectResponse:
    """解析 RDS 文件，使用 R 脚本"""
    import subprocess
    import tempfile

    # R 脚本解析 RDS 文件
    r_script = """
    library(Seurat)
    library(jsonlite)

    args <- commandArgs(trailingOnly = TRUE)
    file_path <- args[1]

    # 读取 RDS 文件
    obj <- readRDS(file_path)

    # 获取维度信息
    n_rows <- nrow(obj)
    n_cols <- ncol(obj)

    # 获取基因名
    genes <- rownames(obj)

    # 尝试获取 Ensemble ID
    gene_ids <- tryCatch({
        # 检查是否有 Ensemble ID 列
        if ("ENSEMBL" %in% colnames(obj@meta.data)) {
            obj@meta.data$ENSEMBL
        } else if ("ensembl_gene_id" %in% colnames(obj@meta.data)) {
            obj@meta.data$ensembl_gene_id
        } else {
            # 尝试从基因名提取 Ensemble ID
            # Ensemble ID 格式: ENSG00000...
            ensembl_pattern <- "^ENS[A-Z]*[0-9]{11}$"
            if (any(grepl(ensembl_pattern, genes))) {
                genes
            } else {
                rep("N/A", length(genes))
            }
        }
    }, error = function(e) {
        rep("N/A", length(genes))
    })

    # 获取元数据列名
    meta_cols <- colnames(obj@meta.data)

    # 输出 JSON
    result <- list(
        n_rows = n_rows,
        n_cols = n_cols,
        genes = genes,
        gene_ids = gene_ids,
        metadata_columns = meta_cols
    )

    cat(toJSON(result, auto_unbox = TRUE))
    """

    # 写入临时 R 脚本
    with tempfile.NamedTemporaryFile(mode='w', suffix='.R', delete=False) as f:
        r_script_path = f.name
        f.write(r_script)

    try:
        # 执行 R 脚本
        result = subprocess.run(
            ["Rscript", r_script_path, file_path],
            capture_output=True,
            text=True,
            timeout=120  # 2 分钟超时
        )

        if result.returncode != 0:
            raise Exception(f"R 脚本执行失败: {result.stderr}")

        # 解析 JSON 输出
        import json
        data = json.loads(result.stdout)

        # 获取文件大小
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        return InspectResponse(
            filename=filename,
            n_rows=data["n_rows"],
            n_cols=data["n_cols"],
            genes=data["genes"][:100],  # 只返回前 100 个基因
            gene_ids=data["gene_ids"][:100],
            file_size_mb=round(file_size_mb, 2),
            metadata_columns=data.get("metadata_columns", [])
        )

    finally:
        # 清理临时 R 脚本
        if os.path.exists(r_script_path):
            os.unlink(r_script_path)


def _parse_h5ad_file(file_path: str, filename: str) -> InspectResponse:
    """解析 H5AD 文件，使用 Python anndata"""
    try:
        import anndata as ad
        import pandas as pd

        # 读取 H5AD 文件
        adata = ad.read_h5ad(file_path)

        # 获取维度信息
        n_rows = adata.n_obs  # 细胞数
        n_cols = adata.n_vars  # 基因数

        # 获取基因名
        genes = adata.var_names.tolist()

        # 尝试获取 Ensemble ID
        gene_ids = []
        if 'gene_ids' in adata.var.columns:
            gene_ids = adata.var['gene_ids'].tolist()
        elif 'ensembl_id' in adata.var.columns:
            gene_ids = adata.var['ensembl_id'].tolist()
        else:
            # 尝试从基因名提取 Ensemble ID
            ensembl_pattern = r'^ENS[A-Z]*[0-9]{11}$'
            import re
            if any(re.match(ensembl_pattern, g) for g in genes):
                gene_ids = genes
            else:
                gene_ids = ["N/A"] * len(genes)

        # 获取文件大小
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        return InspectResponse(
            filename=filename,
            n_rows=n_rows,
            n_cols=n_cols,
            genes=genes[:100],  # 只返回前 100 个基因
            gene_ids=gene_ids[:100],
            file_size_mb=round(file_size_mb, 2),
            metadata_columns=list(adata.obs.columns)
        )

    except ImportError:
        raise Exception("需要安装 anndata 库来解析 H5AD 文件")
    except Exception as e:
        raise Exception(f"解析 H5AD 文件失败: {str(e)}")


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
