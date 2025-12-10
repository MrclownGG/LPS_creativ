from __future__ import annotations

"""
Campaign (投放计划) related API endpoints.

This module provides:
- Listing and creating campaigns
- Listing/creating channel & region dictionaries
- Mapping workflows to campaigns (N:N) and keeping workflow.status in sync:
  - When a workflow is mapped to at least one campaign, its status becomes
    ``in_use`` (if it was ``ready``).
  - When a workflow is no longer mapped to any campaign, its status becomes
    ``ready`` again (if it was ``in_use``).
"""

from typing import List, Optional, Dict

from datetime import datetime
from pathlib import Path
import shutil
import tempfile
import zipfile

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Campaign,
    CampaignChannelDict,
    CampaignRegionDict,
    CampaignWorkflowMap,
    Workflow,
    LandingPage,
    CampaignLandingPage,
)
from app.db.session import get_db
from app.api.workflows import (
    _get_generated_root,
    _inject_channel_tracking,
    _remove_cn_comments,
    _fetch_channel_tracking_for_workflow,
)

router = APIRouter(tags=["campaigns"])


def _get_campaign_generated_root() -> Path:
  root = _get_generated_root() / "campaigns"
  root.mkdir(parents=True, exist_ok=True)
  return root


def _get_campaign_channel_binding_config(campaign: Campaign) -> Optional[dict]:
  config = campaign.config or {}
  binding = config.get("channel_binding")
  if isinstance(binding, dict):
    return binding
  return None


def _set_campaign_channel_binding_config(
  campaign: Campaign,
  binding: dict,
) -> None:
  config = dict(campaign.config or {})
  config["channel_binding"] = binding
  campaign.config = config


def _inject_campaign_channel_values(
  html_content: str,
  external_channel_id: Optional[str],
  token: Optional[str],
) -> str:
  html_content = _inject_channel_tracking(
      html_content, external_channel_id, token
  )
  return _remove_cn_comments(html_content)


def _campaign_online_html_path(
  campaign_id: int,
  landing_page_id: int,
) -> Path:
  target_dir = _get_campaign_generated_root() / str(campaign_id)
  target_dir.mkdir(parents=True, exist_ok=True)
  return target_dir / f"{landing_page_id}.html"


def _campaign_package_base(campaign_id: int, landing_page_id: int) -> Path:
  target_dir = _get_campaign_generated_root() / str(campaign_id)
  target_dir.mkdir(parents=True, exist_ok=True)
  return target_dir / f"{landing_page_id}"


def _write_campaign_online_html(
  source_html: Path,
  dest_html: Path,
  external_channel_id: Optional[str],
  token: Optional[str],
) -> None:
  if not source_html.is_file():
    raise FileNotFoundError(f"html source not found: {source_html}")
  html_content = source_html.read_text(encoding="utf-8")
  rendered = _inject_campaign_channel_values(
      html_content, external_channel_id, token
  )
  dest_html.parent.mkdir(parents=True, exist_ok=True)
  dest_html.write_text(rendered, encoding="utf-8")


def _build_campaign_package_zip(
  base_zip: Path,
  target_base: Path,
  external_channel_id: Optional[str],
  token: Optional[str],
) -> Optional[Path]:
  if not base_zip.is_file():
    return None

  with tempfile.TemporaryDirectory() as tmpdir:
    tmp_path = Path(tmpdir)
    with zipfile.ZipFile(base_zip, "r") as zf:
      zf.extractall(tmp_path)

    for html_file in tmp_path.rglob("*.html"):
      html_text = html_file.read_text(encoding="utf-8")
      html_text = _inject_campaign_channel_values(
          html_text, external_channel_id, token
      )
      html_file.write_text(html_text, encoding="utf-8")

    archive_base = target_base
    archive_path = archive_base.with_suffix(".zip")
    if archive_path.exists():
      archive_path.unlink()
    shutil.make_archive(str(archive_base), "zip", root_dir=tmp_path)
    return archive_path


class CampaignItem(BaseModel):
  """Campaign item for list view."""

  id: int
  name: str
  channels: List[str]
  regions: List[str]
  status: str
  created_by: str
  created_at: str
  workflow_count: int = 0
  bound_channel_name: Optional[str] = None
  selected_landing_page_id: Optional[int] = None


class CampaignListData(BaseModel):
  total: int
  items: List[CampaignItem]


class CampaignListResponse(BaseModel):
  code: int
  message: str
  data: CampaignListData


class CampaignCreateRequest(BaseModel):
  name: str = Field(..., description="Campaign name")
  created_by: Optional[str] = Field(
      default="system",
      description="Creator identifier (username or employee id)",
  )


class CampaignCreateResponse(BaseModel):
  code: int
  message: str
  data: CampaignItem


class WorkflowBrief(BaseModel):
  """Minimal workflow info inside campaign detail."""

  id: int
  name: str
  status: str


class CampaignChannelBindingItem(BaseModel):
  channel_id: int
  channel_name: str
  channel_code: str
  external_channel_id: Optional[str] = None
  token: Optional[str] = None
  updated_at: Optional[str] = None


class CampaignLandingPageSource(BaseModel):
  id: int
  workflow_id: int
  template_id: int
  generated_page_url: str
  language: str


class CampaignDeployedLandingPageItem(BaseModel):
  id: int
  campaign_id: int
  landing_page_id: int
  workflow_id: int
  template_id: int
  page_url: str
  package_url: Optional[str] = None
  channel_id: Optional[int] = None
  channel_external_id: Optional[str] = None
  generated_at: str


class CampaignDetailData(BaseModel):
  id: int
  name: str
  channels: List[str]
  regions: List[str]
  status: str
  created_by: str
  created_at: str
  workflows: List[WorkflowBrief]
  channel_binding: Optional[CampaignChannelBindingItem] = None
  landing_pages: List[CampaignLandingPageSource] = Field(default_factory=list)
  deployed_pages: List[CampaignDeployedLandingPageItem] = Field(default_factory=list)
  selected_landing_page_id: Optional[int] = None


class CampaignDetailResponse(BaseModel):
  code: int
  message: str
  data: CampaignDetailData


class SimpleResponse(BaseModel):
  code: int
  message: str
  data: dict = Field(default_factory=dict)


class CampaignChannelItem(BaseModel):
  id: int
  name: str
  code: str


class CampaignRegionItem(BaseModel):
  id: int
  name: str
  code: str


class CampaignChannelCreateRequest(BaseModel):
  name: str = Field(..., description="Channel name, e.g. 'FB 主页'")
  code: str = Field(..., description="Channel code, e.g. 'FB:28'")


class CampaignRegionCreateRequest(BaseModel):
  name: str = Field(..., description="Region name, e.g. '北美区'")
  code: str = Field(..., description="Region code, e.g. 'US' or 'US-CA'")


class CampaignChannelBindingRequest(BaseModel):
  channel_id: int = Field(..., description="campaign_channel_dict.id")
  token: Optional[str] = Field(
      default=None, description="渠道 token，如未提供将尝试自动获取"
  )
  external_channel_id: Optional[str] = Field(
      default=None, description="渠道在外部系统的 c_id"
  )


class CampaignChannelBindingResponse(BaseModel):
  code: int
  message: str
  data: Optional[CampaignChannelBindingItem] = None


class CampaignLandingPageBindingRequest(BaseModel):
  landing_page_id: int = Field(
      ..., description="landing_page.id，投放计划只能单选一个落地页"
  )


class CampaignLandingPageDeployResponse(BaseModel):
  code: int
  message: str
  data: Optional[CampaignDeployedLandingPageItem] = None


class CampaignWorkflowMapRequest(BaseModel):
  workflow_ids: List[int] = Field(
      ...,
      description=(
          "List of workflow ids to be associated with this campaign. "
          "Workflows must be in 'ready' or 'in_use' status. "
          "The mapping for this campaign will be completely replaced."
      ),
  )


@router.get(
  "/campaigns",
  response_model=CampaignListResponse,
  summary="Query campaign list",
  description="Query campaign list with optional status filter and pagination.",
)
def list_campaigns(
  status: Optional[str] = Query(
      default=None,
      description=(
          "Campaign status filter. When omitted, all statuses are returned."
      ),
  ),
  page: int = Query(default=1, ge=1, description="Page number (1-based)."),
  page_size: int = Query(
      default=20,
      ge=1,
      le=100,
      description="Page size, default 20, max 100.",
  ),
  db: Session = Depends(get_db),
) -> CampaignListResponse:
  query = select(Campaign)

  if status:
    query = query.where(Campaign.status == status)

  count_stmt = select(func.count()).select_from(query.subquery())
  total: int = db.execute(count_stmt).scalar_one()

  offset = (page - 1) * page_size
  campaigns: List[Campaign] = (
      db.execute(
          query.order_by(Campaign.id.desc()).offset(offset).limit(page_size)
      )
      .scalars()
      .all()
  )

  if campaigns:
    ids = [c.id for c in campaigns]
    counts = dict(
        db.execute(
            select(CampaignWorkflowMap.campaign_id, func.count())
            .where(CampaignWorkflowMap.campaign_id.in_(ids))
            .group_by(CampaignWorkflowMap.campaign_id)
        ).all()
    )
    binding_channel_ids = {}
    selected_lp_ids = {}
    for c in campaigns:
      binding = _get_campaign_channel_binding_config(c)
      channel_id = binding.get("channel_id") if binding else None
      if channel_id:
        binding_channel_ids[c.id] = int(channel_id)
      config = c.config or {}
      selected_val = None
      if isinstance(config, dict):
        selected_val = config.get("selected_landing_page_id")
      if selected_val is not None:
        try:
          selected_lp_ids[c.id] = int(selected_val)
        except (TypeError, ValueError):
          selected_lp_ids[c.id] = None
    channel_lookup = {}
    if binding_channel_ids:
      rows = db.execute(
          select(CampaignChannelDict.id, CampaignChannelDict.name).where(
              CampaignChannelDict.id.in_(set(binding_channel_ids.values()))
          )
      ).all()
      channel_lookup = {row.id: row.name for row in rows}
  else:
    counts = {}
    binding_channel_ids = {}
    channel_lookup = {}
    selected_lp_ids = {}

  items = [
      CampaignItem(
          id=c.id,
          name=c.name,
          channels=list(c.channels or []),
          regions=list(c.regions or []),
          status=c.status,
          created_by=c.created_by,
          created_at=c.created_at.isoformat(),
          workflow_count=int(counts.get(c.id, 0)),
          bound_channel_name=(
              channel_lookup.get(binding_channel_ids.get(c.id))
              if binding_channel_ids.get(c.id)
              else None
          ),
          selected_landing_page_id=selected_lp_ids.get(c.id),
      )
      for c in campaigns
  ]

  return CampaignListResponse(
      code=0,
      message="ok",
      data=CampaignListData(total=total, items=items),
  )


@router.post(
  "/campaigns",
  response_model=CampaignCreateResponse,
  summary="Create campaign",
  description="Create a new campaign record.",
)
def create_campaign(
  payload: CampaignCreateRequest,
  db: Session = Depends(get_db),
) -> CampaignCreateResponse:
  campaign = Campaign(
      name=payload.name,
      channels=[],
      regions=[],
      status="active",
      created_by=(payload.created_by or "system").strip() or "system",
  )

  db.add(campaign)
  db.commit()
  db.refresh(campaign)

  item = CampaignItem(
      id=campaign.id,
      name=campaign.name,
      channels=list(campaign.channels or []),
      regions=list(campaign.regions or []),
      status=campaign.status,
      created_by=campaign.created_by,
      created_at=campaign.created_at.isoformat(),
      workflow_count=0,
      bound_channel_name=None,
      selected_landing_page_id=None,
  )

  return CampaignCreateResponse(code=0, message="ok", data=item)


@router.get(
  "/campaigns/{campaign_id}",
  response_model=CampaignDetailResponse,
  summary="Get campaign detail",
  description="Get a campaign and its associated workflows.",
)
def get_campaign_detail(
  campaign_id: int,
  db: Session = Depends(get_db),
) -> CampaignDetailResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return CampaignDetailResponse(
        code=1,
        message=f"campaign {campaign_id} not found",
        data=CampaignDetailData(
            id=0,
            name="",
            channels=[],
            regions=[],
            status="",
            created_by="",
            created_at="",
            workflows=[],
            channel_binding=None,
          landing_pages=[],
          deployed_pages=[],
          selected_landing_page_id=None,
      ),
    )

  wf_rows: List[tuple[int, Optional[str], Optional[str]]] = db.execute(
      select(Workflow.id, Workflow.name, Workflow.status)
      .join(
          CampaignWorkflowMap,
          CampaignWorkflowMap.workflow_id == Workflow.id,
      )
      .where(CampaignWorkflowMap.campaign_id == campaign_id)
      .order_by(Workflow.id.desc())
  ).all()

  workflows = [
      WorkflowBrief(
          id=wid,
          name=wname or "",
          status=wstatus or "",
      )
      for wid, wname, wstatus in wf_rows
  ]
  workflow_ids = [wid for wid, _, _ in wf_rows]

  config = campaign.config or {}
  selected_landing_page_id: Optional[int] = None
  if isinstance(config, dict):
    selected_value = config.get("selected_landing_page_id")
    if isinstance(selected_value, int):
      selected_landing_page_id = selected_value
    elif isinstance(selected_value, str):
      try:
        selected_landing_page_id = int(selected_value)
      except ValueError:
        selected_landing_page_id = None

  binding_cfg = _get_campaign_channel_binding_config(campaign)
  binding_data: Optional[CampaignChannelBindingItem] = None

  if binding_cfg and binding_cfg.get("channel_id"):
    channel = db.get(CampaignChannelDict, binding_cfg["channel_id"])
    if channel:
      binding_data = CampaignChannelBindingItem(
          channel_id=channel.id,
          channel_name=channel.name,
          channel_code=channel.code,
          external_channel_id=binding_cfg.get("external_channel_id"),
          token=binding_cfg.get("token"),
          updated_at=binding_cfg.get("updated_at"),
      )

  landing_pages: List[CampaignLandingPageSource] = []
  lp_rows: List[LandingPage] = (
      db.execute(
          select(LandingPage)
          .order_by(LandingPage.id.desc())
          .limit(200)
      )
      .scalars()
      .all()
  )
  landing_pages = [
      CampaignLandingPageSource(
          id=lp.id,
          workflow_id=lp.workflow_id,
          template_id=lp.template_id,
          generated_page_url=lp.generated_page_url,
          language=lp.language,
      )
      for lp in lp_rows
  ]

  deployed_pages_rows = db.execute(
      select(CampaignLandingPage, LandingPage)
      .join(LandingPage, LandingPage.id == CampaignLandingPage.landing_page_id)
      .where(CampaignLandingPage.campaign_id == campaign_id)
      .order_by(CampaignLandingPage.created_at.desc())
  ).all()

  deployed_pages: List[CampaignDeployedLandingPageItem] = []
  for clp, lp in deployed_pages_rows:
    deployed_pages.append(
        CampaignDeployedLandingPageItem(
            id=clp.id,
            campaign_id=clp.campaign_id,
            landing_page_id=clp.landing_page_id,
            workflow_id=lp.workflow_id if lp else 0,
            template_id=lp.template_id if lp else 0,
            page_url=clp.page_url,
            package_url=clp.package_url,
            channel_id=clp.channel_id,
            channel_external_id=clp.channel_external_id,
            generated_at=clp.created_at.isoformat() if clp.created_at else "",
        )
    )

  data = CampaignDetailData(
      id=campaign.id,
      name=campaign.name,
      channels=list(campaign.channels or []),
      regions=list(campaign.regions or []),
      status=campaign.status,
      created_by=campaign.created_by,
      created_at=campaign.created_at.isoformat(),
      workflows=workflows,
      channel_binding=binding_data,
      landing_pages=landing_pages,
      deployed_pages=deployed_pages,
      selected_landing_page_id=selected_landing_page_id,
  )

  return CampaignDetailResponse(code=0, message="ok", data=data)


@router.post(
  "/campaigns/{campaign_id}/channel-binding",
  response_model=CampaignChannelBindingResponse,
  summary="绑定投放计划使用的渠道",
  description="为投放计划选择一个渠道并保存渠道 token 信息。",
)
def bind_campaign_channel(
  campaign_id: int,
  payload: CampaignChannelBindingRequest,
  db: Session = Depends(get_db),
) -> CampaignChannelBindingResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return CampaignChannelBindingResponse(
        code=1,
        message=f"campaign {campaign_id} not found",
        data=None,
    )

  channel: Optional[CampaignChannelDict] = db.get(
      CampaignChannelDict, payload.channel_id
  )
  if not channel:
    return CampaignChannelBindingResponse(
        code=1,
        message=f"channel {payload.channel_id} not found",
        data=None,
    )

  token = payload.token
  external_id = payload.external_channel_id
  if not token:
    ext_id, fetched_token = _fetch_channel_tracking_for_workflow(channel)
    external_id = external_id or ext_id
    token = fetched_token or token

  binding = {
      "channel_id": channel.id,
      "external_channel_id": external_id,
      "token": token,
      "updated_at": datetime.utcnow().isoformat(),
  }
  _set_campaign_channel_binding_config(campaign, binding)
  db.add(campaign)
  db.commit()
  db.refresh(campaign)

  binding_item = CampaignChannelBindingItem(
      channel_id=channel.id,
      channel_name=channel.name,
      channel_code=channel.code,
      external_channel_id=external_id,
      token=token,
      updated_at=binding["updated_at"],
  )

  return CampaignChannelBindingResponse(
      code=0,
      message="ok",
      data=binding_item,
  )


@router.post(
  "/campaigns/{campaign_id}/landing-page-binding",
  response_model=SimpleResponse,
  summary="为投放计划选择落地页",
  description="为投放计划单选一个落地页，保存到 campaign.config 中。",
)
def bind_campaign_landing_page(
  campaign_id: int,
  payload: CampaignLandingPageBindingRequest,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return SimpleResponse(code=1, message=f"campaign {campaign_id} not found", data={})

  landing_page: Optional[LandingPage] = db.get(
      LandingPage, payload.landing_page_id
  )
  if not landing_page:
    return SimpleResponse(
        code=1,
        message=f"landing page {payload.landing_page_id} not found",
        data={},
    )

  config = dict(campaign.config or {})
  config["selected_landing_page_id"] = int(landing_page.id)
  campaign.config = config

  db.add(campaign)
  db.commit()

  return SimpleResponse(
      code=0,
      message="ok",
      data={"landing_page_id": landing_page.id},
  )


@router.get(
  "/campaign-channels",
  response_model=List[CampaignChannelItem],
  summary="List available campaign channels",
  description="Return all active campaign channel dictionary entries.",
)
def list_campaign_channels(
  db: Session = Depends(get_db),
) -> List[CampaignChannelItem]:
  rows: List[CampaignChannelDict] = (
      db.execute(
          select(CampaignChannelDict).where(
              CampaignChannelDict.status == "active"
          )
      )
      .scalars()
      .all()
  )
  return [
      CampaignChannelItem(id=row.id, name=row.name, code=row.code)
      for row in rows
  ]


@router.post(
  "/campaign-channels",
  response_model=SimpleResponse,
  summary="Create campaign channel",
  description="Create a new campaign channel dictionary entry.",
)
def create_campaign_channel(
  payload: CampaignChannelCreateRequest,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  exists = db.execute(
      select(CampaignChannelDict).where(
          CampaignChannelDict.code == payload.code
      )
  ).scalar_one_or_none()
  if exists:
    return SimpleResponse(
        code=1,
        message=f"channel code {payload.code} already exists",
        data={},
    )

  row = CampaignChannelDict(
      name=payload.name.strip(),
      code=payload.code.strip(),
      status="active",
  )
  db.add(row)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={"id": row.id})


@router.get(
  "/campaign-regions",
  response_model=List[CampaignRegionItem],
  summary="List available campaign regions",
  description="Return all active campaign region dictionary entries.",
)
def list_campaign_regions(
  db: Session = Depends(get_db),
) -> List[CampaignRegionItem]:
  rows: List[CampaignRegionDict] = (
      db.execute(
          select(CampaignRegionDict).where(
              CampaignRegionDict.status == "active"
          )
      )
      .scalars()
      .all()
  )
  return [
      CampaignRegionItem(id=row.id, name=row.name, code=row.code)
      for row in rows
  ]


@router.post(
  "/campaign-regions",
  response_model=SimpleResponse,
  summary="Create campaign region",
  description="Create a new campaign region dictionary entry.",
)
def create_campaign_region(
  payload: CampaignRegionCreateRequest,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  exists = db.execute(
      select(CampaignRegionDict).where(
          CampaignRegionDict.code == payload.code
      )
  ).scalar_one_or_none()
  if exists:
    return SimpleResponse(
        code=1,
        message=f"region code {payload.code} already exists",
        data={},
    )

  row = CampaignRegionDict(
      name=payload.name.strip(),
      code=payload.code.strip(),
      status="active",
  )
  db.add(row)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={"id": row.id})


@router.post(
  "/campaigns/{campaign_id}/landing-pages/{landing_page_id}/deploy",
  response_model=CampaignLandingPageDeployResponse,
  summary="根据投放计划的渠道生成最终落地页",
  description="将指定落地页注入投放计划的渠道信息，并生成在线/离线版本。",
)
def deploy_campaign_landing_page(
  campaign_id: int,
  landing_page_id: int,
  db: Session = Depends(get_db),
) -> CampaignLandingPageDeployResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return CampaignLandingPageDeployResponse(
        code=1,
        message=f"campaign {campaign_id} not found",
        data=None,
    )

  landing_page: Optional[LandingPage] = db.get(LandingPage, landing_page_id)
  if not landing_page:
    return CampaignLandingPageDeployResponse(
        code=1,
        message=f"landing page {landing_page_id} not found",
        data=None,
    )

  binding = _get_campaign_channel_binding_config(campaign)
  if not binding or not binding.get("channel_id"):
    return CampaignLandingPageDeployResponse(
        code=1,
        message="请先在投放计划中绑定渠道后再生成落地页",
        data=None,
    )

  base_dir = _get_generated_root() / str(landing_page.workflow_id)
  base_html = base_dir / f"{landing_page.id}.html"
  if not base_html.is_file():
    return CampaignLandingPageDeployResponse(
        code=1,
        message="落地页基础文件不存在，请先重新生成落地页",
        data=None,
    )

  external_channel_id = binding.get("external_channel_id")
  token = binding.get("token")
  target_html = _campaign_online_html_path(campaign_id, landing_page_id)
  _write_campaign_online_html(
      base_html, target_html, external_channel_id, token
  )

  base_zip = base_dir / f"{landing_page.id}.zip"
  package_base = _campaign_package_base(campaign_id, landing_page_id)
  package_path = _build_campaign_package_zip(
      base_zip, package_base, external_channel_id, token
  )

  page_url = f"/generated/campaigns/{campaign_id}/{landing_page_id}.html"
  package_url = (
      f"/generated/campaigns/{campaign_id}/{landing_page_id}.zip"
      if package_path and package_path.exists()
      else None
  )

  existing: Optional[CampaignLandingPage] = (
      db.execute(
          select(CampaignLandingPage).where(
              CampaignLandingPage.campaign_id == campaign_id,
              CampaignLandingPage.landing_page_id == landing_page_id,
          )
      )
      .scalars()
      .first()
  )

  if not existing:
    existing = CampaignLandingPage(
        campaign_id=campaign_id,
        landing_page_id=landing_page_id,
    )

  existing.channel_id = binding.get("channel_id")
  existing.channel_external_id = external_channel_id
  existing.channel_token = token
  existing.page_url = page_url
  existing.package_url = package_url
  db.add(existing)
  db.commit()
  db.refresh(existing)

  response_item = CampaignDeployedLandingPageItem(
      id=existing.id,
      campaign_id=campaign_id,
      landing_page_id=landing_page_id,
      workflow_id=landing_page.workflow_id,
      template_id=landing_page.template_id,
      page_url=page_url,
      package_url=package_url,
      channel_id=existing.channel_id,
      channel_external_id=external_channel_id,
      generated_at=existing.created_at.isoformat()
      if existing.created_at
      else datetime.utcnow().isoformat(),
  )

  return CampaignLandingPageDeployResponse(
      code=0,
      message="ok",
      data=response_item,
  )


@router.post(
  "/campaigns/{campaign_id}/workflows",
  response_model=SimpleResponse,
  summary="Map workflows to campaign",
  description=(
      "Associate a set of workflows to the given campaign. This operation "
      "replaces previous mappings for the campaign. Only workflows in "
      "status 'ready' or 'in_use' are allowed. After the operation, "
      "workflow.status will be updated: workflows mapped to at least one "
      "campaign become 'in_use', workflows not mapped to any campaign "
      "become 'ready' again (if they were 'in_use')."
  ),
)
def map_campaign_workflows(
  campaign_id: int,
  payload: CampaignWorkflowMapRequest,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return SimpleResponse(
        code=1,
        message=f"campaign {campaign_id} not found",
        data={},
    )

  # Collect existing mappings for this campaign so we can later update
  # workflow statuses correctly.
  existing: List[CampaignWorkflowMap] = (
      db.execute(
          select(CampaignWorkflowMap).where(
              CampaignWorkflowMap.campaign_id == campaign_id
          )
      )
      .scalars()
      .all()
  )
  old_workflow_ids = {m.workflow_id for m in existing}
  new_workflow_ids = set(payload.workflow_ids or [])

  # Validate new workflows if any are provided.
  if new_workflow_ids:
    wf_rows: List[Workflow] = (
        db.execute(select(Workflow).where(Workflow.id.in_(new_workflow_ids)))
        .scalars()
        .all()
    )
    if len(wf_rows) != len(new_workflow_ids):
      return SimpleResponse(
          code=1,
          message="some workflows not found",
          data={},
      )

    invalid_status_ids = [
        w.id for w in wf_rows if w.status not in ("ready", "in_use")
    ]
    if invalid_status_ids:
      return SimpleResponse(
          code=1,
          message=(
              "only ready or in_use workflows can be mapped, got invalid "
              f"status workflows: {invalid_status_ids}"
          ),
          data={},
      )

  # Clear all existing mappings for this campaign, then insert the new ones.
  for m in existing:
    db.delete(m)

  for wid in new_workflow_ids:
    db.add(CampaignWorkflowMap(campaign_id=campaign_id, workflow_id=wid))

  # Flush to make sure the in-memory state reflects the new mapping before
  # we compute counts.
  db.flush()

  # Update workflow.status for any workflows whose mapping set changed.
  touched_workflow_ids = list(old_workflow_ids | new_workflow_ids)
  if touched_workflow_ids:
    counts = dict(
        db.execute(
            select(CampaignWorkflowMap.workflow_id, func.count())
            .where(CampaignWorkflowMap.workflow_id.in_(touched_workflow_ids))
            .group_by(CampaignWorkflowMap.workflow_id)
        ).all()
    )

    wf_to_update: List[Workflow] = (
        db.execute(
            select(Workflow).where(Workflow.id.in_(touched_workflow_ids))
        )
        .scalars()
        .all()
    )

    for w in wf_to_update:
      mapped_count = int(counts.get(w.id, 0))
      if mapped_count > 0:
        # At least one campaign is using this workflow: promote ready -> in_use.
        if w.status == "ready":
          w.status = "in_use"
          db.add(w)
      else:
        # No campaigns reference this workflow any more: demote in_use -> ready.
        if w.status == "in_use":
          w.status = "ready"
          db.add(w)

  db.commit()

  return SimpleResponse(
      code=0,
      message="ok",
      data={"mapped_count": len(new_workflow_ids)},
  )


@router.delete(
  "/campaigns/{campaign_id}",
  response_model=SimpleResponse,
  summary="删除投放计划",
  description="删除指定投放计划，级联清理关联关系（campaign_workflow_map、campaign_landing_page）。",
)
def delete_campaign(
  campaign_id: int,
  db: Session = Depends(get_db),
) -> SimpleResponse:
  campaign: Optional[Campaign] = db.get(Campaign, campaign_id)
  if not campaign:
    return SimpleResponse(code=1, message=f"campaign {campaign_id} not found", data={})

  db.delete(campaign)
  db.commit()

  return SimpleResponse(code=0, message="ok", data={})
