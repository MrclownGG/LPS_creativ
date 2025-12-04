from __future__ import annotations

from typing import Dict, List, Tuple, Optional

import httpx
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import CampaignChannelDict
from app.db.session import get_db


router = APIRouter(tags=["channels"])


class ChannelItem(BaseModel):
    """单个渠道配置项"""

    id: int
    name: str
    channel_code: str = Field(default="")


class ChannelListData(BaseModel):
    items: List[ChannelItem]


class ChannelListResponse(BaseModel):
    code: int
    message: str
    data: ChannelListData


def _sync_channels_from_external(
    db: Session, settings: Settings
) -> Tuple[bool, str]:
    """
    从外部接口同步渠道列表到本地 campaign_channel_dict 表。

    返回 (是否成功, 提示信息)。
    """
    if not settings.external_channel_api_url:
        return False, "EXTERNAL_CHANNEL_API_URL 未配置，请先在 .env 中设置"

    url = str(settings.external_channel_api_url)
    headers: Dict[str, str] = {}

    # 如外部接口需要鉴权，可在 .env 中配置 EXTERNAL_CHANNEL_API_TOKEN，
    # 这里先简单通过 Authorization 头透传，具体格式后续可根据实际接口调整。
    if settings.external_channel_api_token:
        headers["Authorization"] = settings.external_channel_api_token

    try:
        resp = httpx.get(url, headers=headers, timeout=10.0)
    except httpx.RequestError as exc:
        return False, f"调用外部渠道接口失败: {exc}"

    if resp.status_code != 200:
        return False, f"外部渠道接口返回非 200 状态码: {resp.status_code}"

    # 该接口返回体前面有一个多余的 '?'，需要先清理再做 JSON 解析
    text = resp.text.lstrip("\ufeff")
    if text.startswith("?"):
        text = text[1:]

    try:
        payload = json.loads(text)
    except ValueError:
        return False, "外部渠道接口返回内容不是合法 JSON"

    raw_list = payload.get("data") or []
    if not isinstance(raw_list, list):
        return False, "外部渠道接口 data 字段格式异常"

    for item in raw_list:
        if not isinstance(item, dict):
            continue

        _id = item.get("id")
        try:
            external_id = int(_id)
        except (TypeError, ValueError):
            external_id = None

        name = str(item.get("name") or "")
        channel_code = str(item.get("channel_code") or "")

        if not channel_code and external_id is None:
            # 没有任何可用编码信息时跳过
            continue

        # 使用 channel_code 作为唯一编码进行去重和更新
        stmt = select(CampaignChannelDict).where(
            CampaignChannelDict.code == channel_code
        )
        existing: CampaignChannelDict | None = db.execute(stmt).scalar_one_or_none()

        if existing:
            existing.name = name
            existing.status = "active"
        else:
            code_value = channel_code or (str(external_id) if external_id else "")
            row = CampaignChannelDict(
                name=name,
                code=code_value,
                status="active",
            )
            db.add(row)

    db.commit()
    return True, "ok"


def _fetch_channel_token_from_external(
    channel_identifier: str,
    settings: Settings,
) -> Tuple[bool, str, str | None, Optional[int], Optional[str]]:
    """
    调用外部接口获取指定渠道对应的 token。

    Args:
        channel_identifier: 渠道在对方系统中的唯一标识（通常是 id 或 code）。
        settings: 全局配置，读取外部接口地址和鉴权信息。

    Returns:
        (success, message, token, remote_code)
    """
    token_api = settings.external_token_api_url
    if not token_api:
        return False, "EXTERNAL_TOKEN_API_URL 未配置，请先在 .env 中设置", None, None, None

    url = str(token_api)
    headers: Dict[str, str] = {}
    if settings.external_channel_api_token:
        headers["Authorization"] = settings.external_channel_api_token

    payload = {"id": channel_identifier}

    try:
        resp = httpx.post(url, headers=headers, data=payload, timeout=10.0)
    except httpx.RequestError as exc:  # pragma: no cover - 网络异常
        return False, f"调用外部渠道 token 接口失败: {exc}", None, None, None

    if resp.status_code != 200:
        return (
            False,
            f"外部渠道 token 接口返回非 200 状态码: {resp.status_code}",
            None,
            None,
        )

    text = resp.text.lstrip("\ufeff")
    if text.startswith("?"):
        text = text[1:]

    try:
        payload = json.loads(text)
    except ValueError:
        return False, "外部渠道 token 接口返回内容不是合法 JSON", None, None, None

    data_field = payload.get("data")
    token: Optional[str] = None
    remote_code: Optional[int] = None
    external_channel_id: Optional[str] = None
    code_raw = payload.get("code")
    try:
        remote_code = int(code_raw)
    except (TypeError, ValueError):
        remote_code = None

    if isinstance(data_field, dict):
        external_channel_id = (
            data_field.get("c_id")
            or data_field.get("channel_id")
            or data_field.get("channel_code")
        )
        token = (
            data_field.get("c_token")
            or data_field.get("token")
            or data_field.get("access_token")
        )
    elif isinstance(data_field, list) and data_field:
        first = data_field[0]
        if isinstance(first, dict):
            external_channel_id = (
                first.get("c_id")
                or first.get("channel_id")
                or first.get("channel_code")
            )
            token = (
                first.get("c_token")
                or first.get("token")
                or first.get("access_token")
            )

    if not token:
        token = (
            payload.get("c_token")
            or payload.get("token")
            or payload.get("access_token")
        )

    if not token:
        return False, "外部渠道 token 接口未返回 token 字段", None, remote_code, None

    return True, "ok", token, remote_code, external_channel_id


@router.get(
    "/channels",
    response_model=ChannelListResponse,
    summary="获取渠道列表",
    description=(
        "优先从本地渠道字典表读取（campaign_channel_dict），"
        "如本地无数据且配置了 EXTERNAL_CHANNEL_API_URL，则尝试从外部接口同步一次。"
    ),
)
def list_channels(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChannelListResponse:
    # 先从本地渠道字典表读取
    db_rows: List[CampaignChannelDict] = (
        db.execute(
            select(CampaignChannelDict)
            .where(CampaignChannelDict.status == "active")
            .order_by(CampaignChannelDict.id)
        )
        .scalars()
        .all()
    )

    # 如果本地没有数据，并且配置了外部接口，则尝试自动同步一次
    if not db_rows and settings.external_channel_api_url:
        ok, msg = _sync_channels_from_external(db, settings)
        if not ok:
            return ChannelListResponse(
                code=1,
                message=msg,
                data=ChannelListData(items=[]),
            )
        db_rows = (
            db.execute(
                select(CampaignChannelDict)
                .where(CampaignChannelDict.status == "active")
                .order_by(CampaignChannelDict.id)
            )
            .scalars()
            .all()
        )

    items: List[ChannelItem] = [
        ChannelItem(
            id=row.id,
            name=row.name,
            channel_code=row.code or "",
        )
        for row in db_rows
    ]

    return ChannelListResponse(
        code=0,
        message="ok",
        data=ChannelListData(items=items),
    )


class ChannelSyncResponse(BaseModel):
    code: int
    message: str
    data: Dict[str, int] = Field(default_factory=dict)


class ChannelTokenData(BaseModel):
    channel_code: str
    channel_id: int
    token: str
    external_channel_id: Optional[str] = None


class ChannelTokenResponse(BaseModel):
    code: int
    message: str
    data: ChannelTokenData | None = None


@router.post(
    "/channels/sync",
    response_model=ChannelSyncResponse,
    summary="从外部接口同步渠道到本地字典表",
    description=(
        "主动触发一次渠道同步：调用 EXTERNAL_CHANNEL_API_URL，将结果写入 "
        "campaign_channel_dict 表。通常在渠道配置变更时由管理员手动调用。"
    ),
)
def sync_channels(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChannelSyncResponse:
    ok, msg = _sync_channels_from_external(db, settings)
    return ChannelSyncResponse(
        code=0 if ok else 1,
        message=msg,
        data={},
    )


@router.post(
    "/channels/{channel_id}/token",
    response_model=ChannelTokenResponse,
    summary="根据渠道 ID 获取外部 token",
    description=(
        "将渠道 ID 映射为对方系统的标识，然后调用 EXTERNAL_CHANNEL_API_URL 的 POST 能力，"
        "把 token 拉到本地返回。"
    ),
)
def fetch_channel_token(
    channel_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChannelTokenResponse:
    channel: CampaignChannelDict | None = db.get(CampaignChannelDict, channel_id)
    if not channel:
        return ChannelTokenResponse(
            code=1,
            message=f"channel {channel_id} not found",
            data=None,
        )

    identifier = str(channel.id)
    ok, msg, token, remote_code, external_channel_id = _fetch_channel_token_from_external(
        identifier, settings
    )
    if not ok or not token:
        return ChannelTokenResponse(
            code=remote_code if remote_code is not None else 1,
            message=msg,
            data=None,
        )

    return ChannelTokenResponse(
        code=remote_code if remote_code is not None else 0,
        message="ok",
        data=ChannelTokenData(
            channel_id=channel_id,
            channel_code=identifier,
            token=token,
            external_channel_id=external_channel_id,
        ),
    )
