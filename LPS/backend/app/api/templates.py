from __future__ import annotations

from typing import List, Optional

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Template
from app.db.session import get_db

router = APIRouter(tags=["templates"])


def _get_backend_root() -> Path:
  """获取 backend 根目录，例如 LPS_creativ/LPS/backend/"""
  # 当前文件位于 backend/app/api/templates.py
  # parents[0] = .../backend/app/api
  # parents[1] = .../backend/app
  # parents[2] = .../backend
  return Path(__file__).resolve().parents[2]


def _get_generated_root() -> Path:
  """生成静态 HTML 文件的根目录"""
  return _get_backend_root() / "generated"


def _get_templates_root() -> Path:
  """模板静态资源根目录 LPS_creativ/LPS/templates"""
  return _get_backend_root().parent / "templates"


class TemplateItem(BaseModel):
  """单个模板的对外展示字段。"""

  id: int
  name: str
  description: Optional[str] = None
  thumbnail_url: Optional[str] = None
  html_file_path: str
  max_videos: int
  static_assets_path: Optional[str] = None
  status: str


class TemplateListData(BaseModel):
  """模板列表响应中的 data 部分。"""

  total: int
  items: List[TemplateItem]


class TemplateListResponse(BaseModel):
  """模板列表接口的标准返回结构。"""

  code: int
  message: str
  data: TemplateListData


class TemplatePreviewData(BaseModel):
  """模板预览返回的 data 部分。"""

  preview_url: str


class TemplatePreviewResponse(BaseModel):
  """模板预览接口的标准返回结构。"""

  code: int
  message: str
  data: Optional[TemplatePreviewData]


class TemplateCreateRequest(BaseModel):
  """
  手动注册模板的请求体。
  当前仅登记元数据和静态文件路径，实际 HTML 内容从文件系统读取。
  """

  name: str = Field(..., description="模板名称")
  description: Optional[str] = Field(default=None, description="模板描述")
  thumbnail_url: Optional[str] = Field(
      default=None, description="缩略图 URL（可选）"
  )
  html_file_path: str = Field(..., description="模板 HTML 文件路径")
  max_videos: int = Field(
      ...,
      ge=1,
      description="模板可容纳的视频数量上限",
  )
  static_assets_path: Optional[str] = Field(
      default=None, description="静态资源路径（CSS/JS/图片）"
  )
  status: str = Field(default="active", description="模板状态")


class TemplateCreateResponse(BaseModel):
  code: int
  message: str
  data: TemplateItem


class SimpleResponse(BaseModel):
  code: int
  message: str
  data: dict = Field(default_factory=dict)


@router.get(
  "/templates",
  response_model=TemplateListResponse,
  summary="查询模板列表",
  description="按状态和分页查询模板列表。",
)
def list_templates(
  status: Optional[str] = Query(
      default=None, description="模板状态，例如 active/inactive，可选。",
  ),
  page: int = Query(default=1, ge=1, description="页码，从 1 开始。"),
  page_size: int = Query(
      default=20,
      ge=1,
      le=100,
      description="每页数量，默认 20，最大 100。",
  ),
  db: Session = Depends(get_db),
) -> TemplateListResponse:
  query = select(Template)

  if status:
    query = query.where(Template.status == status)

  count_stmt = select(func.count()).select_from(query.subquery())
  total: int = db.execute(count_stmt).scalar_one()

  offset = (page - 1) * page_size
  templates: List[Template] = (
      db.execute(
          query.order_by(Template.id.desc()).offset(offset).limit(page_size)
      )
      .scalars()
      .all()
  )

  items = [
      TemplateItem(
          id=t.id,
          name=t.name,
          description=t.description,
          thumbnail_url=t.thumbnail_url,
          html_file_path=t.html_file_path,
          max_videos=t.max_videos,
          static_assets_path=t.static_assets_path,
          status=t.status,
      )
      for t in templates
  ]

  return TemplateListResponse(
      code=0,
      message="ok",
      data=TemplateListData(total=total, items=items),
  )


@router.post(
  "/templates",
  response_model=TemplateCreateResponse,
  summary="手动注册模板",
  description="将一套静态模板（HTML + 资源路径）注册到系统中。",
)
def create_template(
  payload: TemplateCreateRequest,
  db: Session = Depends(get_db),
) -> TemplateCreateResponse:
  template = Template(
      name=payload.name,
      description=payload.description,
      thumbnail_url=payload.thumbnail_url,
      html_file_path=payload.html_file_path,
      max_videos=payload.max_videos,
      static_assets_path=payload.static_assets_path,
      status=payload.status or "active",
  )

  db.add(template)
  db.commit()
  db.refresh(template)

  item = TemplateItem(
      id=template.id,
      name=template.name,
      description=template.description,
      thumbnail_url=template.thumbnail_url,
      html_file_path=template.html_file_path,
      max_videos=template.max_videos,
      static_assets_path=template.static_assets_path,
      status=template.status,
  )

  return TemplateCreateResponse(code=0, message="ok", data=item)


@router.put(
  "/templates/{template_id}",
  response_model=TemplateCreateResponse,
  summary="编辑模板信息",
  description="根据 ID 更新模板的基础信息。",
)
def update_template(
  template_id: int,
  payload: TemplateCreateRequest,
  db: Session = Depends(get_db),
) -> TemplateCreateResponse:
  template: Optional[Template] = db.get(Template, template_id)
  if not template:
    return TemplateCreateResponse(
        code=1,
        message=f"template {template_id} not found",
        data=None,  # type: ignore[arg-type]
    )

  template.name = payload.name
  template.description = payload.description
  template.thumbnail_url = payload.thumbnail_url
  template.html_file_path = payload.html_file_path
  template.max_videos = payload.max_videos
  template.static_assets_path = payload.static_assets_path
  template.status = payload.status or template.status

  db.add(template)
  db.commit()
  db.refresh(template)

  item = TemplateItem(
      id=template.id,
      name=template.name,
      description=template.description,
      thumbnail_url=template.thumbnail_url,
      html_file_path=template.html_file_path,
      max_videos=template.max_videos,
      static_assets_path=template.static_assets_path,
      status=template.status,
  )

  return TemplateCreateResponse(code=0, message="ok", data=item)


@router.delete(
  "/templates/{template_id}",
  response_model=SimpleResponse,
  summary="删除模板",
  description="根据 ID 删除一条模板记录（当前为硬删除）。",
)
def delete_template(
  template_id: int,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  template: Optional[Template] = db.get(Template, template_id)
  if not template:
    return SimpleResponse(
        code=1,
        message=f"template {template_id} not found",
        data={},
    )

  db.delete(template)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={})


@router.post(
  "/templates/{template_id}/preview",
  response_model=TemplatePreviewResponse,
  summary="预览模板",
  description=(
      "根据模板 ID 读取 HTML 文件，修正静态资源路径，"
      "生成用于预览的静态 HTML，并返回预览 URL。"
  ),
)
def preview_template(
  template_id: int,
  db: Session = Depends(get_db),
) -> TemplatePreviewResponse:
  template: Optional[Template] = db.get(Template, template_id)
  if not template:
    return TemplatePreviewResponse(
        code=1,
        message=f"template {template_id} not found",
        data=None,
    )

  # 解析模板 HTML 文件路径，兼容多种写法（与工作流预览逻辑保持一致）
  raw_html_path = Path(template.html_file_path)
  backend_root = _get_backend_root()
  project_root = backend_root.parent          # LPS_creativ/LPS
  repo_root = project_root.parent             # LPS_creativ
  templates_root = _get_templates_root()      # LPS_creativ/LPS/templates

  candidate_paths = [
      raw_html_path,
      project_root / raw_html_path,
      repo_root / raw_html_path,
      templates_root / raw_html_path,
  ]

  html_path: Optional[Path] = None
  for p in candidate_paths:
    try:
      if p.is_file():
        html_path = p
        break
    except Exception:
      continue

  if html_path is None:
    return TemplatePreviewResponse(
        code=1,
        message=f"template html file not found for path: {template.html_file_path}",
        data=None,
    )

  try:
    html_content = html_path.read_text(encoding="utf-8")
  except Exception as e:  # pragma: no cover
    return TemplatePreviewResponse(
        code=1,
        message=f"failed to read template html file: {e}",
        data=None,
    )

  # 计算模板静态资源前缀（/templates/xxx），用于修正相对路径
  static_prefix = "/templates"
  if template.static_assets_path:
    assets_path = Path(template.static_assets_path)
    templates_root = _get_templates_root()
    try:
      if assets_path.is_absolute():
        rel = assets_path.relative_to(templates_root)
      else:
        rel = (templates_root / assets_path).relative_to(templates_root)
      static_prefix = f"/templates/{rel.as_posix()}"
    except Exception:
      static_prefix = "/templates"

  # 将模板中的相对静态资源路径 ./xxx 改写为以 /templates/... 开头的绝对路径
  html_content = html_content.replace('href="./', f'href="{static_prefix}/')
  html_content = html_content.replace('src="./', f'src="{static_prefix}/')

  # 注入一个空的选中视频列表，方便模板脚本统一处理
  selected_json = json.dumps([], ensure_ascii=False)
  snippet = (
      '<script id="lps-selected-videos" type="application/json">'
      f"{selected_json}"
      "</script>"
  )
  if "</body>" in html_content:
    html_content = html_content.replace("</body>", f"{snippet}\n</body>", 1)
  else:
    html_content += snippet

  # 写入预览目录：generated/template_preview/{template_id}_{uuid}.html
  generated_root = _get_generated_root()
  preview_dir = generated_root / "template_preview"
  preview_dir.mkdir(parents=True, exist_ok=True)
  filename = f"{template.id}_{uuid4().hex}.html"
  output_path = preview_dir / filename

  try:
    output_path.write_text(html_content, encoding="utf-8")
  except Exception as e:  # pragma: no cover
    return TemplatePreviewResponse(
        code=1,
        message=f"failed to write template preview html file: {e}",
        data=None,
    )

  preview_url = f"/generated/template_preview/{filename}"
  data = TemplatePreviewData(preview_url=preview_url)
  return TemplatePreviewResponse(code=0, message="ok", data=data)

