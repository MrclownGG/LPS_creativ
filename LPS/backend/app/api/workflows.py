from __future__ import annotations

from typing import List, Optional

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import LandingPage, Template, Workflow, Video
from app.db.session import get_db

router = APIRouter(tags=["workflows"])


def _get_backend_root() -> Path:
  """获取 backend 根目录，例如 LPS_creativ/LPS/backend/"""
  # 当前文件位于 backend/app/api/workflows.py
  # parents[0] = .../backend/app/api
  # parents[1] = .../backend/app
  # parents[2] = .../backend
  return Path(__file__).resolve().parents[2]


def _get_generated_root() -> Path:
  """生成落地页 HTML 文件的根目录"""
  return _get_backend_root() / "generated"


def _get_templates_root() -> Path:
  """模板静态资源根目录 LPS_creativ/LPS/templates"""
  return _get_backend_root().parent / "templates"


def _build_selected_videos_payload(
  db: Session,
  selected_ids: List[int],
) -> List[dict]:
  """
  根据选中的视频 ID 列表，按顺序构建用于模板渲染的简要视频信息列表。
  目前仅包含 id / poster_url / title 三个字段。
  """
  if not selected_ids:
    return []

  videos: List[Video] = (
      db.execute(select(Video).where(Video.id.in_(selected_ids)))
      .scalars()
      .all()
  )
  video_map = {v.id: v for v in videos}

  payload: List[dict] = []
  for vid in selected_ids:
    v = video_map.get(vid)
    if not v:
      continue
    payload.append(
        {
            "id": v.id,
            "poster_url": v.poster_url,
            "title": v.title,
        }
    )

  return payload


class LandingPageItem(BaseModel):
  """落地页简要信息（用于工作流详情中展示）"""

  id: int
  template_id: int
  selected_video_ids: List[int]
  generated_page_url: str


class WorkflowItem(BaseModel):
  """工作流列表中的简要信息"""

  id: int
  name: str
  status: str
  created_by: str
  created_at: str
  landing_page_count: int = 0


class WorkflowListData(BaseModel):
  total: int
  items: List[WorkflowItem]


class WorkflowListResponse(BaseModel):
  code: int
  message: str
  data: WorkflowListData


class WorkflowDetailData(BaseModel):
  id: int
  name: str
  status: str
  created_by: str
  created_at: str
  updated_at: str
  landing_pages: List[LandingPageItem]


class WorkflowDetailResponse(BaseModel):
  code: int
  message: str
  data: WorkflowDetailData


class WorkflowCreateRequest(BaseModel):
  name: str = Field(..., description="工作流批次名称")
  created_by: Optional[str] = Field(
      default="system", description="创建者标识（用户名或工号）"
  )


class WorkflowCreateResponse(BaseModel):
  code: int
  message: str
  data: WorkflowItem


class WorkflowGenerateRequest(BaseModel):
  """
  触发落地页生成的请求体。

  - video_ids: 选中的视频 ID 列表
  - template_ids: 选中的模板 ID 列表
  """

  video_ids: List[int] = Field(..., min_items=1)
  template_ids: List[int] = Field(..., min_items=1)


class WorkflowGenerateData(BaseModel):
  workflow_id: int
  landing_pages: List[LandingPageItem]


class WorkflowGenerateResponse(BaseModel):
  code: int
  message: str
  data: Optional[WorkflowGenerateData]


class WorkflowPreviewRequest(BaseModel):
  """
  落地页预览请求体（不创建实际 landing_page 记录，只生成静态 HTML 文件用于预览）。
  """

  video_ids: List[int] = Field(..., min_items=1)
  template_id: int


class WorkflowPreviewData(BaseModel):
  preview_url: str


class WorkflowPreviewResponse(BaseModel):
  code: int
  message: str
  data: Optional[WorkflowPreviewData]


class SimpleResponse(BaseModel):
  code: int
  message: str
  data: dict = Field(default_factory=dict)


@router.get(
  "/workflows",
  response_model=WorkflowListResponse,
  summary="查询落地页工作流列表",
  description="按状态和分页查询工作流批次列表。",
)
def list_workflows(
  status: Optional[str] = Query(
      default=None,
      description="工作流状态，示例：draft / generating / pending_ad / ready / archived",
  ),
  page: int = Query(default=1, ge=1, description="页码，从 1 开始。"),
  page_size: int = Query(
      default=20,
      ge=1,
      le=100,
      description="每页数量，默认 20，最大 100。",
  ),
  db: Session = Depends(get_db),
) -> WorkflowListResponse:
  query = select(Workflow)

  if status:
    query = query.where(Workflow.status == status)

  count_stmt = select(func.count()).select_from(query.subquery())
  total: int = db.execute(count_stmt).scalar_one()

  offset = (page - 1) * page_size
  workflows: List[Workflow] = (
      db.execute(
          query.order_by(Workflow.id.desc()).offset(offset).limit(page_size)
      )
      .scalars()
      .all()
  )

  # 预先统计每个 workflow 的落地页数量
  if workflows:
    wf_ids = [w.id for w in workflows]
    lp_counts = dict(
        db.execute(
            select(LandingPage.workflow_id, func.count())
            .where(LandingPage.workflow_id.in_(wf_ids))
            .group_by(LandingPage.workflow_id)
        ).all()
    )
  else:
    lp_counts = {}

  items = [
      WorkflowItem(
          id=w.id,
          name=w.name,
          status=w.status,
          created_by=w.created_by,
          created_at=w.created_at.isoformat(),
          landing_page_count=int(lp_counts.get(w.id, 0)),
      )
      for w in workflows
  ]

  return WorkflowListResponse(
      code=0,
      message="ok",
      data=WorkflowListData(total=total, items=items),
  )


@router.post(
  "/workflows",
  response_model=WorkflowCreateResponse,
  summary="创建落地页工作流批次",
  description="创建一个新的工作流批次，初始状态为 draft。",
)
def create_workflow(
  payload: WorkflowCreateRequest,
  db: Session = Depends(get_db),
) -> WorkflowCreateResponse:
  workflow = Workflow(
      name=payload.name,
      status="draft",
      created_by=payload.created_by or "system",
  )
  db.add(workflow)
  db.commit()
  db.refresh(workflow)

  item = WorkflowItem(
      id=workflow.id,
      name=workflow.name,
      status=workflow.status,
      created_by=workflow.created_by,
      created_at=workflow.created_at.isoformat(),
      landing_page_count=0,
  )

  return WorkflowCreateResponse(code=0, message="ok", data=item)


@router.get(
  "/workflows/{workflow_id}",
  response_model=WorkflowDetailResponse,
  summary="查询单个工作流详情",
  description="获取单个工作流批次及其下所有落地页的详细信息。",
)
def get_workflow_detail(
  workflow_id: int,
  db: Session = Depends(get_db),
) -> WorkflowDetailResponse:
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return WorkflowDetailResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data=WorkflowDetailData(
            id=0,
            name="",
            status="",
            created_by="",
            created_at="",
            updated_at="",
            landing_pages=[],
        ),
    )

  lps: List[LandingPage] = (
      db.execute(
          select(LandingPage).where(LandingPage.workflow_id == workflow_id)
      )
      .scalars()
      .all()
  )

  lp_items = [
      LandingPageItem(
          id=lp.id,
          template_id=lp.template_id,
          selected_video_ids=list(lp.selected_video_ids or []),
          generated_page_url=lp.generated_page_url,
      )
      for lp in lps
  ]

  data = WorkflowDetailData(
      id=workflow.id,
      name=workflow.name,
      status=workflow.status,
      created_by=workflow.created_by,
      created_at=workflow.created_at.isoformat(),
      updated_at=workflow.updated_at.isoformat(),
      landing_pages=lp_items,
  )

  return WorkflowDetailResponse(code=0, message="ok", data=data)


@router.post(
  "/workflows/{workflow_id}/generate",
  response_model=WorkflowGenerateResponse,
  summary="生成落地页",
  description="根据选中的视频和模板，为指定工作流生成落地页记录并输出 HTML。",
)
def generate_landing_pages(
  workflow_id: int,
  payload: WorkflowGenerateRequest,
  db: Session = Depends(get_db),
) -> WorkflowGenerateResponse:
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return WorkflowGenerateResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data=None,
    )

  if workflow.status not in ("draft",):
    return WorkflowGenerateResponse(
        code=1,
        message=f"workflow {workflow_id} is not in draft status",
        data=None,
    )

  # 获取模板信息并校验
  templates: List[Template] = (
      db.execute(
          select(Template).where(Template.id.in_(payload.template_ids))
      )
      .scalars()
      .all()
  )
  if len(templates) != len(set(payload.template_ids)):
    return WorkflowGenerateResponse(
        code=1,
        message="some templates not found",
        data=None,
    )

  # 校验每个模板所需的视频数量
  for t in templates:
    if len(payload.video_ids) < t.max_videos:
      return WorkflowGenerateResponse(
          code=1,
          message=(
              f"模板 {t.id} 需要至少 {t.max_videos} 个视频，"
              f"当前仅选择了 {len(payload.video_ids)} 个"
          ),
          data=None,
      )

  # 检查是否已存在相同 (workflow_id, template_id) 的落地页
  existing_pairs = set(
      db.execute(
          select(LandingPage.template_id).where(
              LandingPage.workflow_id == workflow_id,
              LandingPage.template_id.in_(payload.template_ids),
          )
      ).scalars()
  )
  if existing_pairs:
    return WorkflowGenerateResponse(
        code=1,
        message=(
            "以下模板在该工作流下已存在落地页实例，"
            f"无法重复生成：{sorted(existing_pairs)}"
        ),
        data=None,
    )

  landing_page_items: List[LandingPageItem] = []

  # 为每个模板创建 landing_page 记录并生成 HTML 文件
  for t in templates:
    # 简单策略：按传入顺序取前 max_videos 个视频
    selected_ids = payload.video_ids[: t.max_videos]

    lp = LandingPage(
        workflow_id=workflow_id,
        template_id=t.id,
        selected_video_ids=selected_ids,
        generated_page_url="",
    )
    db.add(lp)
    db.flush()  # 获取 lp.id

    # 读取模板 HTML，并兼容多种路径写法
    # 支持：
    # - 绝对路径；
    # - 相对于 LPS_creativ/LPS 的路径，例如 "templates/home/index.html"；
    # - 相对于仓库根的路径，例如 "LPS/templates/home/index.html"。
    raw_html_path = Path(t.html_file_path)
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
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"template html file not found for path: {t.html_file_path}",
          data=None,
      )

    try:
      html_content = html_path.read_text(encoding="utf-8")
    except Exception as e:  # pragma: no cover
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"failed to read template html file: {e}",
          data=None,
      )

    # 计算模板静态资源前缀（/templates/xxx），用于修正相对路径
    static_prefix = "/templates"
    if t.static_assets_path:
      assets_path = Path(t.static_assets_path)
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

    # 在页面中注入选中视频 ID，方便后续排查
    selected_json = json.dumps(selected_ids, ensure_ascii=False)
    snippet = (
        '<script id="lps-selected-videos" type="application/json">'
        f"{selected_json}"
        "</script>"
    )
    if "</body>" in html_content:
      html_content = html_content.replace("</body>", f"{snippet}\n</body>", 1)
    else:
      html_content += snippet

    # 写入生成目录：generated/{workflow_id}/{landing_page_id}.html
    generated_root = _get_generated_root()
    output_dir = generated_root / str(workflow_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{lp.id}.html"

    try:
      output_path.write_text(html_content, encoding="utf-8")
    except Exception as e:  # pragma: no cover
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"failed to write generated html file: {e}",
          data=None,
      )

    # 更新落地页访问 URL
    lp.generated_page_url = f"/generated/{workflow_id}/{lp.id}.html"

    landing_page_items.append(
        LandingPageItem(
            id=lp.id,
            template_id=lp.template_id,
            selected_video_ids=selected_ids,
            generated_page_url=lp.generated_page_url,
        )
    )

  # 更新 workflow 状态：直接标记为 pending_ad（等待上传广告）
  workflow.status = "pending_ad"
  db.add(workflow)
  db.commit()

  data = WorkflowGenerateData(
      workflow_id=workflow_id,
      landing_pages=landing_page_items,
  )

  return WorkflowGenerateResponse(code=0, message="ok", data=data)


@router.post(
  "/workflows/preview",
  response_model=WorkflowPreviewResponse,
  summary="预览落地页（不落库）",
  description=(
      "根据选中的视频和单个模板，生成一个用于预览的静态 HTML 文件，并返回预览 URL。"
      "不会创建 landing_page 记录，也不会修改 workflow 状态。"
  ),
)
def preview_landing_page(
  payload: WorkflowPreviewRequest,
  db: Session = Depends(get_db),
) -> WorkflowPreviewResponse:
  template: Optional[Template] = db.get(Template, payload.template_id)
  if not template:
    return WorkflowPreviewResponse(
        code=1,
        message=f"template {payload.template_id} not found",
        data=None,
    )

  if len(payload.video_ids) < template.max_videos:
    return WorkflowPreviewResponse(
        code=1,
        message=(
            f"模板 {template.id} 需要至少 {template.max_videos} 个视频，"
            f"当前仅选择了 {len(payload.video_ids)} 个"
        ),
        data=None,
    )

  # 简单策略：按传入顺序取前 max_videos 个视频
  selected_ids = payload.video_ids[: template.max_videos]

  # 读取模板 HTML，并兼容多种路径写法（与 generate_landing_pages 保持一致）
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
    return WorkflowPreviewResponse(
        code=1,
        message=f"template html file not found for path: {template.html_file_path}",
        data=None,
    )

  try:
    html_content = html_path.read_text(encoding="utf-8")
  except Exception as e:  # pragma: no cover
    return WorkflowPreviewResponse(
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

  # 在页面中注入选中视频 ID，方便后续排查
  selected_json = json.dumps(selected_ids, ensure_ascii=False)
  snippet = (
      '<script id="lps-selected-videos" type="application/json">'
      f"{selected_json}"
      "</script>"
  )
  if "</body>" in html_content:
    html_content = html_content.replace("</body>", f"{snippet}\n</body>", 1)
  else:
    html_content += snippet

  # 写入预览目录：generated/preview/{template_id}_{uuid}.html
  generated_root = _get_generated_root()
  preview_dir = generated_root / "preview"
  preview_dir.mkdir(parents=True, exist_ok=True)
  filename = f"{template.id}_{uuid4().hex}.html"
  output_path = preview_dir / filename

  try:
    output_path.write_text(html_content, encoding="utf-8")
  except Exception as e:  # pragma: no cover
    return WorkflowPreviewResponse(
        code=1,
        message=f"failed to write preview html file: {e}",
        data=None,
    )

  preview_url = f"/generated/preview/{filename}"

  data = WorkflowPreviewData(preview_url=preview_url)
  return WorkflowPreviewResponse(code=0, message="ok", data=data)

@router.post(
  "/workflows/{workflow_id}/archive",
  response_model=SimpleResponse,
  summary="归档工作流",
  description="将工作流状态置为 archived，表示该批次已结束，仅保留历史。",
)
def archive_workflow(
  workflow_id: int,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return SimpleResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data={},
    )

  if workflow.status != "ready":
    return SimpleResponse(
        code=1,
        message=f"workflow {workflow_id} is not in ready status",
        data={},
    )

  workflow.status = "archived"
  db.add(workflow)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={})


@router.delete(
  "/workflows/{workflow_id}",
  response_model=SimpleResponse,
  summary="删除工作流批次",
  description=(
      "根据 ID 删除一个工作流批次。将级联删除其下所有 landing_page 记录和广告图关联，"
      "但不会影响已入库的视频素材、广告图素材和模板本身。"
  ),
)
def delete_workflow(
  workflow_id: int,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  """
  删除指定的工作流批次。

  - 不限制状态：draft / pending_ad / ready / in_use / archived 等都允许删除；
  - 依赖数据库的 ON DELETE CASCADE：
    - 自动清理 landing_page、workflow_ad_map 等关联记录；
    - 不会删除 video、template、ad_image_library 等基础数据。
  """
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return SimpleResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data={},
    )

  db.delete(workflow)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={})
