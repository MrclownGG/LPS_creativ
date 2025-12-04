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

from typing import List, Optional

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
)
from app.db.session import get_db

router = APIRouter(tags=["campaigns"])


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


class CampaignListData(BaseModel):
  total: int
  items: List[CampaignItem]


class CampaignListResponse(BaseModel):
  code: int
  message: str
  data: CampaignListData


class CampaignCreateRequest(BaseModel):
  name: str = Field(..., description="Campaign name")
  channels: List[str] = Field(
      ...,
      description="Channel codes list, e.g. ['FB', 'IG']",
  )
  regions: List[str] = Field(
      ...,
      description="Region codes list, e.g. ['US', 'BR']",
  )
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


class CampaignDetailData(BaseModel):
  id: int
  name: str
  channels: List[str]
  regions: List[str]
  status: str
  created_by: str
  created_at: str
  workflows: List[WorkflowBrief]


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
  else:
    counts = {}

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
      channels=payload.channels,
      regions=payload.regions,
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

  data = CampaignDetailData(
      id=campaign.id,
      name=campaign.name,
      channels=list(campaign.channels or []),
      regions=list(campaign.regions or []),
      status=campaign.status,
      created_by=campaign.created_by,
      created_at=campaign.created_at.isoformat(),
      workflows=workflows,
  )

  return CampaignDetailResponse(code=0, message="ok", data=data)


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

