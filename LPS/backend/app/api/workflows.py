from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import json
import mimetypes
import re
import shutil
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

import httpx

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AdImageLibrary,
    LandingPage,
    Template,
    Workflow,
    WorkflowAdMap,
    CampaignWorkflowMap,
    Campaign,
    Video,
    CampaignChannelDict,
)
from app.db.session import get_db
from app.core.config import get_settings

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


def _get_ad_images_dir(workflow_id: int) -> Path:
  """工作流广告图上传目录 backend/generated/workflow_ad_images/{workflow_id}"""
  return _get_generated_root() / "workflow_ad_images" / str(workflow_id)


def _copy_template_assets(src_dir: Path, dst_dir: Path, ignore_names: Optional[set[str]] = None) -> None:
  """复制模板静态资源到目标目录，忽略指定文件"""
  if not src_dir.is_dir():
    return
  ignore_names = ignore_names or set()
  for item in src_dir.iterdir():
    if item.name in ignore_names:
      continue
    target = dst_dir / item.name
    if item.is_dir():
      shutil.copytree(item, target, dirs_exist_ok=True)
    elif item.is_file():
      target.parent.mkdir(parents=True, exist_ok=True)
      shutil.copy2(item, target)


def _guess_extension_from_url(url: str) -> str:
  parsed = urlparse(url or "")
  suffix = Path(parsed.path).suffix
  if suffix:
    return suffix
  return ".jpg"


def _download_binary(url: str, target_path: Path) -> bool:
  if not url:
    return False
  try:
    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
  except httpx.HTTPError:
    return False
  target_path.parent.mkdir(parents=True, exist_ok=True)
  target_path.write_bytes(resp.content)
  return True


def _prepare_local_posters(
  selected_payload: List[dict],
  target_dir: Path,
  public_prefix: str,
) -> List[Optional[str]]:
  """
  下载或刷新选中视频的封面到 target_dir，并返回与 selected_payload 顺序对应的本地文件名列表。
  同时把 payload 内的 poster_url 改写为 public_prefix 对应的可访问路径。
  """
  if target_dir.exists():
    shutil.rmtree(target_dir)
  target_dir.mkdir(parents=True, exist_ok=True)

  filenames: List[Optional[str]] = []

  for idx, info in enumerate(selected_payload, start=1):
    poster_url = (info.get("poster_url") or "").strip()
    if not poster_url:
      filenames.append(None)
      continue

    ext = _guess_extension_from_url(poster_url)
    filename = f"poster_{idx}{ext}"
    target_path = target_dir / filename
    if _download_binary(poster_url, target_path):
      info["poster_url"] = f"{public_prefix}/{filename}"
      filenames.append(filename)
    else:
      filenames.append(None)

  return filenames


def _inject_selected_videos(
  html_content: str,
  selected_ids: List[int],
  selected_payload: List[dict],
) -> str:
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

  detail_json = json.dumps(selected_payload, ensure_ascii=False)
  detail_snippet = (
      '<script id="lps-selected-videos-detail" type="application/json">'
      f"{detail_json}"
      "</script>"
  )
  if "</body>" in html_content:
    html_content = html_content.replace(
        "</body>", f"{detail_snippet}\n</body>", 1
    )
  else:
    html_content += detail_snippet

  return html_content


def _replace_gallery_images(html_content: str, poster_urls: List[str]) -> str:
  if not poster_urls:
    return html_content

  pattern = re.compile(
      r'<img\b[^>]*class="[^"]*\blist-item-img\b[^"]*"[^>]*>',
      re.IGNORECASE,
  )
  urls_iter = iter(poster_urls)

  def repl(match: re.Match[str]) -> str:
    try:
      url = next(urls_iter)
    except StopIteration:
      return match.group(0)
    tag = match.group(0)
    if 'src="' in tag:
      return re.sub(r'src="[^"]*"', f'src="{url}"', tag, count=1)
    return tag.replace("<img", f'<img src="{url}"', 1)

  return pattern.sub(repl, html_content)


def _inject_channel_tracking(
  html_content: str,
  channel_external_id: Optional[str],
  channel_token: Optional[str],
) -> str:
  """
  将模板中的 facebookInfo 替换为实际渠道信息。
  """
  if not channel_external_id and not channel_token:
    return html_content

  replacement = (
      "    var facebookInfo = {\n"
      f'      id: "{channel_external_id or ""}",\n'
      "      token:\n"
      f'        "{channel_token or ""}",\n'
      "    };"
  )

  pattern = re.compile(
      r"var\s+facebookInfo\s*=\s*\{[\s\S]*?\};",
      re.IGNORECASE,
  )
  if pattern.search(html_content):
    return pattern.sub(replacement, html_content, count=1)

  return html_content


def _fetch_channel_tracking_for_workflow(
  channel: CampaignChannelDict,
) -> Tuple[str, Optional[str]]:
  """
  获取渠道在外部系统的 c_id 以及 token（若可用）。
  """
  settings = get_settings()
  token_api = settings.external_token_api_url
  identifier = channel.code or str(channel.id)

  if not token_api:
    return identifier, None

  headers: Dict[str, str] = {}
  if settings.external_channel_api_token:
    headers["Authorization"] = settings.external_channel_api_token

  payload = {"id": str(channel.id)}

  try:
    resp = httpx.post(str(token_api), headers=headers, data=payload, timeout=10.0)
    resp.raise_for_status()
  except httpx.HTTPError:
    return identifier, None

  text = resp.text.lstrip("\ufeff")
  if text.startswith("?"):
    text = text[1:]

  try:
    body = json.loads(text)
  except ValueError:
    return identifier, None

  data_field = body.get("data")

  def _extract(item: dict) -> Tuple[str, Optional[str]]:
    ext_id = str(item.get("c_id") or item.get("channel_code") or identifier)
    token_value = (
        item.get("c_token")
        or item.get("token")
        or item.get("access_token")
    )
    return ext_id, token_value

  if isinstance(data_field, dict):
    return _extract(data_field)

  if isinstance(data_field, list) and data_field:
    first = data_field[0]
    if isinstance(first, dict):
      return _extract(first)

  return identifier, None


def _rewrite_static_urls(html_content: str, prefix: str) -> str:
  """
  将 href/src/url 中以 ./ 开头的静态资源引用改写为以 prefix 开头的绝对路径。
  仅用于在线预览 / 在线版本，离线包仍使用相对路径。
  """
  html_content = html_content.replace('href="./', f'href="{prefix}/')
  html_content = html_content.replace('src="./', f'src="{prefix}/')

  css_url_pattern = re.compile(r'url\((["\']?)\./')

  def _css_repl(match: re.Match[str]) -> str:
    quote = match.group(1) or ""
    return f'url({quote}{prefix}/'

  return css_url_pattern.sub(_css_repl, html_content)


def _normalize_static_assets_subpath(raw_path: Optional[str]) -> Optional[str]:
  """
  清洗 static_assets_path，去掉 ./、templates/ 等前缀，返回相对于 templates 根目录的子路径。
  """
  if not raw_path:
    return None
  cleaned = raw_path.strip().replace("\\", "/")
  cleaned = cleaned.lstrip("./")
  if cleaned.lower().startswith("templates/"):
    cleaned = cleaned.split("/", 1)[1]
  cleaned = cleaned.strip("/")
  return cleaned or None


def _build_static_prefix(
  static_assets_path: Optional[str],
  templates_root: Path,
) -> str:
  """
  根据模板的静态资源路径计算 /templates/... 形式的前缀，自动规避重复 templates/。
  """
  if not static_assets_path:
    return "/templates"

  path_obj = Path(static_assets_path)
  rel_part: Optional[str] = None

  if path_obj.is_absolute():
    try:
      rel = path_obj.resolve().relative_to(templates_root.resolve())
      rel_part = rel.as_posix().strip("/")
    except Exception:
      return "/templates"
  else:
    rel_part = _normalize_static_assets_subpath(static_assets_path)

  if rel_part:
    return f"/templates/{rel_part}"
  return "/templates"


def _resolve_assets_source(
  static_assets_path: Optional[str],
  templates_root: Path,
  html_dir: Path,
) -> Path:
  """
  解析静态资源目录在本地磁盘上的真实位置，优先使用 static_assets_path，找不到时退回 HTML 所在目录。
  """
  if not static_assets_path:
    return html_dir

  candidates: List[Path] = []
  raw_path = Path(static_assets_path)

  if raw_path.is_absolute():
    candidates.append(raw_path)
  else:
    normalized = _normalize_static_assets_subpath(static_assets_path)
    if normalized:
      candidates.append(templates_root / normalized)
    candidates.append(templates_root / raw_path)

  for candidate in candidates:
    try:
      if candidate.is_dir():
        return candidate
    except Exception:
      continue

  return html_dir


# 语言与文案配置（后续需要扩展时可以在此处添加）
SUPPORTED_LANGUAGES = ("zh", "en", "pt")

HTML_LANG_ATTR = {
  "zh": "zh-CN",
  "en": "en",
  "pt": "pt-BR",
}

# 固定文案多语言映射表，key 为模板中的中文原文
PHRASE_MAP = {
  "免费网站": {
    "zh": "免费网站",
    "en": "Free website",
    "pt": "Site gratuito",
  },
  "下载": {
    "zh": "下载",
    "en": "Download",
    "pt": "Baixar",
  },
  "更多精彩影片进APP搜索": {
    "zh": "更多精彩影片进APP搜索",
    "en": "More great movies in the app",
    "pt": "Mais filmes incríveis, pesquise no app",
  },
}


def _apply_language(html_content: str, language: Optional[str]) -> str:
  """
  根据选定语言替换模板中的固定文案，并更新 <html lang="...">。

  - language: 'zh' / 'en' / 'pt'，其它值或 None 时回退为 'zh'
  """
  lang = (language or "zh").lower()
  if lang not in SUPPORTED_LANGUAGES:
    lang = "zh"

  lang_attr = HTML_LANG_ATTR.get(lang, "zh-CN")

  # 替换或补充 <html lang="...">
  if 'lang="' in html_content:
    html_content = re.sub(
      r'<html\s+lang="[^"]*"',
      f'<html lang="{lang_attr}"',
      html_content,
      count=1,
    )
  else:
    html_content = html_content.replace(
      "<html", f'<html lang="{lang_attr}"', 1
    )

  # 替换固定中文文案
  for cn_text, langs in PHRASE_MAP.items():
    target = langs.get(lang, cn_text)
    if cn_text and target:
      html_content = html_content.replace(cn_text, target)

  return html_content


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


class SelectedVideoItem(BaseModel):
  """工作流详情中展示的单个视频简要信息"""

  id: int
  title: str
  poster_url: str


class LandingPageItem(BaseModel):
  """落地页简要信息（用于工作流详情中展示）"""

  id: int
  template_id: int
  channel_id: Optional[int] = None
  selected_video_ids: List[int]
  generated_page_url: str
  selected_videos: List[SelectedVideoItem] = Field(default_factory=list)
  language: str
  package_url: Optional[str] = None


class WorkflowItem(BaseModel):
  """工作流列表中的简要信息"""

  id: int
  name: str
  status: str
  created_by: str
  created_at: str
  landing_page_count: int = 0
  ad_image_count: int = 0
  campaign_count: int = 0
  campaign_names: List[str] = Field(default_factory=list)
  languages: List[str] = Field(default_factory=list)
  channel_names: List[str] = Field(default_factory=list)


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
  ad_image_count: int = 0
  campaign_count: int = 0
  campaign_names: List[str] = Field(default_factory=list)


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
  channel_id: int = Field(
    ...,
    description=(
      "选中的渠道 ID（campaign_channel_dict.id），"
      "一个落地页仅对应一个渠道"
    ),
  )
  language: Optional[str] = Field(
    default="zh",
    description="落地页语言代码，例如 zh / en / pt，默认为 zh",
  )


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
  channel_id: int = Field(
    ...,
    description=(
      "预览时选中的渠道 ID（campaign_channel_dict.id），"
      "一个落地页仅对应一个渠道"
    ),
  )
  language: Optional[str] = Field(
    default="zh",
    description="预览时使用的语言代码，例如 zh / en / pt，默认为 zh",
  )


class WorkflowPreviewData(BaseModel):
  preview_url: str


class WorkflowPreviewResponse(BaseModel):
  code: int
  message: str
  data: Optional[WorkflowPreviewData]


class WorkflowAdImageItem(BaseModel):
  id: int
  file_url: str
  file_name: Optional[str] = None


class WorkflowAdImageListResponse(BaseModel):
  code: int
  message: str
  data: List[WorkflowAdImageItem]


class WorkflowAdImageUploadResponse(BaseModel):
  code: int
  message: str
  data: WorkflowAdImageItem


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
    # 汇总每个 workflow 下落地页的语言（去重）
    lp_lang_rows = db.execute(
        select(LandingPage.workflow_id, LandingPage.language)
        .where(LandingPage.workflow_id.in_(wf_ids))
        .group_by(LandingPage.workflow_id, LandingPage.language)
    ).all()
    wf_languages: dict[int, List[str]] = {}
    for wid, lang in lp_lang_rows:
      if not lang:
        continue
      wf_languages.setdefault(wid, []).append(lang)
    ad_counts = dict(
        db.execute(
            select(WorkflowAdMap.workflow_id, func.count())
            .where(WorkflowAdMap.workflow_id.in_(wf_ids))
            .group_by(WorkflowAdMap.workflow_id)
        ).all()
    )
    campaign_counts = dict(
        db.execute(
            select(CampaignWorkflowMap.workflow_id, func.count())
            .where(CampaignWorkflowMap.workflow_id.in_(wf_ids))
            .group_by(CampaignWorkflowMap.workflow_id)
        ).all()
    )
    campaign_names_rows = db.execute(
        select(CampaignWorkflowMap.workflow_id, Campaign.name)
        .join(Campaign, Campaign.id == CampaignWorkflowMap.campaign_id)
        .where(CampaignWorkflowMap.workflow_id.in_(wf_ids))
        .order_by(CampaignWorkflowMap.workflow_id, Campaign.id)
    ).all()
    campaign_names_map: dict[int, List[str]] = {}
    for wid, cname in campaign_names_rows:
      campaign_names_map.setdefault(wid, []).append(cname or "")
    channel_rows = db.execute(
        select(
            LandingPage.workflow_id,
            LandingPage.channel_id,
            CampaignChannelDict.name,
        )
        .join(
            CampaignChannelDict,
            CampaignChannelDict.id == LandingPage.channel_id,
            isouter=True,
        )
        .where(LandingPage.workflow_id.in_(wf_ids))
    ).all()
    wf_channel_names: dict[int, List[str]] = {}
    for wid, cid, cname in channel_rows:
      if not cid:
        continue
      label = cname or f"渠道 ID：{cid}"
      wf_channel_names.setdefault(wid, []).append(label)
  else:
    lp_counts = {}
    ad_counts = {}
    campaign_counts = {}
    campaign_names_map = {}
    wf_languages = {}
    wf_channel_names = {}

  items = [
      WorkflowItem(
          id=w.id,
          name=w.name,
          status=w.status,
          created_by=w.created_by,
          created_at=w.created_at.isoformat(),
          landing_page_count=int(lp_counts.get(w.id, 0)),
          ad_image_count=int(ad_counts.get(w.id, 0)),
          campaign_count=int(campaign_counts.get(w.id, 0)),
          campaign_names=campaign_names_map.get(w.id, []),
          languages=wf_languages.get(w.id, []),
          channel_names=wf_channel_names.get(w.id, []),
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
      ad_image_count=0,
      campaign_count=0,
      channel_names=[],
      languages=[],
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

  lp_items: List[LandingPageItem] = []
  generated_root = _get_generated_root()
  for lp in lps:
    selected_payload = _build_selected_videos_payload(
        db, list(lp.selected_video_ids or [])
    )
    package_url = None
    package_path = generated_root / str(lp.workflow_id) / f"{lp.id}.zip"
    if package_path.is_file():
      package_url = f"/generated/{lp.workflow_id}/{lp.id}.zip"

    lp_items.append(
        LandingPageItem(
            id=lp.id,
            template_id=lp.template_id,
            channel_id=getattr(lp, "channel_id", None),
            selected_video_ids=list(lp.selected_video_ids or []),
            generated_page_url=lp.generated_page_url,
            language=getattr(lp, "language", "zh"),
            selected_videos=[
                SelectedVideoItem(
                    id=item.get("id", 0),
                    poster_url=item.get("poster_url", ""),
                    title=item.get("title", ""),
                )
                for item in selected_payload
            ],
            package_url=package_url,
        )
    )

  data = WorkflowDetailData(
      id=workflow.id,
      name=workflow.name,
      status=workflow.status,
      created_by=workflow.created_by,
      created_at=workflow.created_at.isoformat(),
      updated_at=workflow.updated_at.isoformat(),
      landing_pages=lp_items,
      ad_image_count=int(
          db.execute(
              select(func.count())
              .select_from(WorkflowAdMap)
              .where(WorkflowAdMap.workflow_id == workflow_id)
          ).scalar_one()
      ),
      campaign_count=int(
          db.execute(
              select(func.count())
              .select_from(CampaignWorkflowMap)
              .where(CampaignWorkflowMap.workflow_id == workflow_id)
          ).scalar_one()
      ),
      campaign_names=[
          row[0]
          for row in db.execute(
              select(Campaign.name)
              .join(
                  CampaignWorkflowMap,
                  CampaignWorkflowMap.campaign_id == Campaign.id,
              )
              .where(CampaignWorkflowMap.workflow_id == workflow_id)
              .order_by(Campaign.id)
          ).all()
      ],
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

  # 校验渠道是否存在（一个落地页仅对应一个渠道）
  channel: Optional[CampaignChannelDict] = db.get(
      CampaignChannelDict, payload.channel_id
  )
  if not channel:
    return WorkflowGenerateResponse(
        code=1,
        message=f"channel {payload.channel_id} not found",
        data=None,
    )

  channel_external_id, channel_token = _fetch_channel_tracking_for_workflow(
      channel
  )

  landing_page_items: List[LandingPageItem] = []
  generated_root = _get_generated_root()


  # 为每个模板创建 landing_page 记录并生成 HTML 及静态资源包
  for t in templates:
    selected_ids = payload.video_ids[: t.max_videos]

    lang_value = (payload.language or "zh").lower()
    if lang_value not in SUPPORTED_LANGUAGES:
      lang_value = "zh"

    lp = LandingPage(
        workflow_id=workflow_id,
        template_id=t.id,
        channel_id=payload.channel_id,
        selected_video_ids=selected_ids,
        generated_page_url="",
        language=lang_value,
    )
    db.add(lp)
    db.flush()  # 获取 lp.id

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
      base_html = html_path.read_text(encoding="utf-8")
    except Exception as e:  # pragma: no cover
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"failed to read template html file: {e}",
          data=None,
      )

    base_html = _apply_language(base_html, payload.language)
    base_html = _inject_channel_tracking(
        base_html, channel_external_id, channel_token
    )

    # 在线版本：依旧引用 /templates/... 静态资源，供系统内预览使用
    static_prefix = _build_static_prefix(t.static_assets_path, templates_root)
    online_html = _rewrite_static_urls(base_html, static_prefix)

    selected_payload_online = _build_selected_videos_payload(db, selected_ids)
    selected_payload_offline = [item.copy() for item in selected_payload_online]

    online_posters_dir = generated_root / str(workflow_id) / f"{lp.id}_posters"
    poster_filenames = _prepare_local_posters(
        selected_payload_online,
        online_posters_dir,
        f"/generated/{workflow_id}/{lp.id}_posters",
    )
    poster_urls_online = [
        item.get("poster_url", "").strip() for item in selected_payload_online
    ]
    online_html = _replace_gallery_images(online_html, poster_urls_online)
    online_html = _inject_selected_videos(
        online_html, selected_ids, selected_payload_online
    )

    online_output_dir = generated_root / str(workflow_id)
    online_output_dir.mkdir(parents=True, exist_ok=True)
    online_html_path = online_output_dir / f"{lp.id}.html"
    try:
      online_html_path.write_text(online_html, encoding="utf-8")
    except Exception as e:  # pragma: no cover
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"failed to write generated html file: {e}",
          data=None,
      )

    lp.generated_page_url = f"/generated/{workflow_id}/{lp.id}.html"
    package_rel_path: Optional[str] = None

    # 离线包：复制静态资源并下载封面
    offline_html = base_html
    offline_root = generated_root / str(workflow_id) / f"{lp.id}_package"
    if offline_root.exists():
      shutil.rmtree(offline_root)
    offline_root.mkdir(parents=True, exist_ok=True)

    assets_source = _resolve_assets_source(
        t.static_assets_path, templates_root, html_path.parent
    )
    _copy_template_assets(
        assets_source, offline_root, ignore_names={html_path.name}
    )

    posters_dir = offline_root / "posters"
    posters_dir.mkdir(parents=True, exist_ok=True)
    for idx, filename in enumerate(poster_filenames, start=1):
      if not filename:
        continue
      src = online_posters_dir / filename
      if not src.is_file():
        continue
      dst = posters_dir / filename
      shutil.copy2(src, dst)
      selected_payload_offline[idx - 1]["poster_url"] = f"./posters/{filename}"

    poster_urls_offline = [
        item.get("poster_url", "").strip() for item in selected_payload_offline
    ]
    offline_html = _replace_gallery_images(offline_html, poster_urls_offline)
    offline_html = _inject_selected_videos(
        offline_html, selected_ids, selected_payload_offline
    )

    offline_html_path = offline_root / html_path.name
    try:
      offline_html_path.write_text(offline_html, encoding="utf-8")
    except Exception as e:  # pragma: no cover
      db.rollback()
      return WorkflowGenerateResponse(
          code=1,
          message=f"failed to write package html file: {e}",
          data=None,
      )

    try:
      package_base = generated_root / str(workflow_id) / f"{lp.id}"
      shutil.make_archive(str(package_base), "zip", root_dir=offline_root)
      package_rel_path = f"/generated/{workflow_id}/{lp.id}.zip"
    except Exception:
      package_rel_path = None
    finally:
      try:
        shutil.rmtree(offline_root)
      except Exception:
        pass

    landing_page_items.append(
        LandingPageItem(
            id=lp.id,
            template_id=lp.template_id,
            channel_id=getattr(lp, "channel_id", None),
            selected_video_ids=selected_ids,
            generated_page_url=lp.generated_page_url,
            language=getattr(lp, "language", "zh"),
            package_url=package_rel_path,
        )
    )

  data = WorkflowGenerateData(
      workflow_id=workflow_id,
      landing_pages=landing_page_items,
  )

  workflow.status = "pending_ad"
  db.add(workflow)
  db.commit()

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

  channel: Optional[CampaignChannelDict] = db.get(
      CampaignChannelDict, payload.channel_id
  )
  if not channel:
    return WorkflowPreviewResponse(
        code=1,
        message=f"channel {payload.channel_id} not found",
        data=None,
    )

  channel_external_id, channel_token = _fetch_channel_tracking_for_workflow(
      channel
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
  static_prefix = _build_static_prefix(template.static_assets_path, templates_root)

  # 将模板中的相对静态资源路径 ./xxx 改写为以 /templates/... 开头的绝对路径
  html_content = _rewrite_static_urls(html_content, static_prefix)

  html_content = _apply_language(html_content, payload.language)
  html_content = _inject_channel_tracking(
      html_content, channel_external_id, channel_token
  )

  selected_payload = _build_selected_videos_payload(db, selected_ids)
  poster_urls_preview = [
      item.get("poster_url", "").strip()
      for item in selected_payload
      if item.get("poster_url")
  ]
  html_content = _replace_gallery_images(html_content, poster_urls_preview)
  html_content = _inject_selected_videos(
      html_content, selected_ids, selected_payload
  )

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


@router.get(
  "/workflows/{workflow_id}/ad-images",
  response_model=WorkflowAdImageListResponse,
  summary="查询工作流广告图",
  description="返回指定工作流已上传并关联的广告素材列表",
)
def list_workflow_ad_images(
  workflow_id: int,
  db: Session = Depends(get_db),
) -> WorkflowAdImageListResponse:
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return WorkflowAdImageListResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data=[],
    )

  ad_images: List[AdImageLibrary] = (
      db.execute(
          select(AdImageLibrary)
          .join(
              WorkflowAdMap,
              WorkflowAdMap.ad_image_id == AdImageLibrary.id,
          )
          .where(WorkflowAdMap.workflow_id == workflow_id)
          .order_by(AdImageLibrary.id.desc())
      )
      .scalars()
      .all()
  )

  items = [
      WorkflowAdImageItem(
          id=img.id,
          file_url=img.file_url,
          file_name=img.file_name,
      )
      for img in ad_images
  ]

  return WorkflowAdImageListResponse(code=0, message="ok", data=items)


@router.post(
  "/workflows/{workflow_id}/ad-images/upload",
  response_model=WorkflowAdImageUploadResponse,
  summary="上传工作流广告图",
  description="上传本地广告图文件并关联到指定工作流",
)
async def upload_workflow_ad_image(
  workflow_id: int,
  file: UploadFile = File(...),
  author: Optional[str] = Form(default="system"),
  db: Session = Depends(get_db),
) -> WorkflowAdImageUploadResponse:
  workflow: Optional[Workflow] = db.get(Workflow, workflow_id)
  if not workflow:
    return WorkflowAdImageUploadResponse(
        code=1,
        message=f"workflow {workflow_id} not found",
        data=WorkflowAdImageItem(id=0, file_url="", file_name=""),
    )

  if not file.content_type or not file.content_type.startswith("image/"):
    return WorkflowAdImageUploadResponse(
        code=1,
        message="仅支持上传图片文件",
        data=WorkflowAdImageItem(id=0, file_url="", file_name=""),
    )

  content = await file.read()
  if not content:
    return WorkflowAdImageUploadResponse(
        code=1,
        message="文件内容为空",
        data=WorkflowAdImageItem(id=0, file_url="", file_name=""),
    )

  original_name = file.filename or "ad_image"
  suffix = Path(original_name).suffix.lower()
  if not suffix:
    suffix = (mimetypes.guess_extension(file.content_type or "") or ".jpg")

  output_dir = _get_ad_images_dir(workflow_id)
  output_dir.mkdir(parents=True, exist_ok=True)
  new_filename = f"{uuid4().hex}{suffix}"
  output_path = output_dir / new_filename
  output_path.write_bytes(content)

  file_url = f"/generated/workflow_ad_images/{workflow_id}/{new_filename}"
  ad_image = AdImageLibrary(
      file_url=file_url,
      file_name=original_name,
      file_size=len(content),
      author=(author or "system").strip() or "system",
      upload_batch=f"workflow-{workflow_id}",
  )
  db.add(ad_image)
  db.flush()
  mapping = WorkflowAdMap(workflow_id=workflow_id, ad_image_id=ad_image.id)
  db.add(mapping)

  if workflow.status == "pending_ad":
    workflow.status = "ready"
    db.add(workflow)

  db.commit()
  db.refresh(ad_image)

  data = WorkflowAdImageItem(
      id=ad_image.id,
      file_url=ad_image.file_url,
      file_name=ad_image.file_name,
  )
  return WorkflowAdImageUploadResponse(code=0, message="ok", data=data)
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
