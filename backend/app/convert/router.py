"""
scCloud v2 — 格式转换路由
处理文件上传和格式转换请求。
对应旧系统中缺失的功能 (BUG-T4)。
"""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import get_settings
from app.db.models import User, get_db
from app.utils.r_bridge import call_r_engine

router = APIRouter(prefix="/api/convert", tags=["格式转换"])


class ConvertRequest(BaseModel):
    """格式转换请求 (已上传文件)。"""
    input_path: str
    output_format: str  # rds | h5seurat | h5ad | 10x


class ConvertResponse(BaseModel):
    status: str
    input: str
    output: str
    format: str
    cells: int | None = None
    genes: int | None = None
    download_url: str | None = None


@router.post("/upload", response_model=dict)
async def upload_for_convert(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    上传文件用于格式转换。
    返回服务端存储路径。
    """
    settings = get_settings()

    # 验证文件类型
    allowed_ext = {".rds", ".h5seurat", ".h5ad", ".h5"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}",
        )

    # 存储到临时目录
    upload_dir = os.path.join(
        settings.projects_root,
        str(current_user.id),
        "_convert",
    )
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    return {
        "status": "uploaded",
        "path": filepath,
        "filename": file.filename,
        "size_mb": round(len(content) / 1024 / 1024, 2),
    }


@router.post("", response_model=ConvertResponse)
async def convert_format(
    req: ConvertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    执行格式转换。
    调用 R 引擎的 /convert 端点。
    """
    settings = get_settings()

    # 验证输出格式
    valid_formats = {"rds", "h5seurat", "h5ad", "10x"}
    if req.output_format not in valid_formats:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的输出格式: {req.output_format}",
        )

    # 构造输出路径
    input_dir = os.path.dirname(req.input_path)
    input_name = os.path.splitext(os.path.basename(req.input_path))[0]

    if req.output_format == "10x":
        output_path = os.path.join(input_dir, f"{input_name}_10x")
    else:
        ext_map = {"rds": ".rds", "h5seurat": ".h5seurat", "h5ad": ".h5ad"}
        output_path = os.path.join(
            input_dir, f"{input_name}{ext_map[req.output_format]}"
        )

    # 调用 R 引擎 (不需要 task 记录，直接同步调用)
    import httpx

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0)
    ) as client:
        response = await client.post(
            f"{settings.r_engine_url}/convert",
            json={
                "input_path": req.input_path,
                "output_format": req.output_format,
                "output_path": output_path,
            },
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"R 引擎转换失败: {response.text}",
        )

    result = response.json()

    return ConvertResponse(
        status=result.get("status", "success"),
        input=req.input_path,
        output=output_path,
        format=req.output_format,
        cells=result.get("cells"),
        genes=result.get("genes"),
        download_url=f"/api/convert/download?path={output_path}",
    )
