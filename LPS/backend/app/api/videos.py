from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Video
from app.db.session import get_db

router = APIRouter(tags=["videos"])


def _get_backend_root() -> Path:
    """backend 根目录，例如 LPS_creativ/LPS/backend/"""
    return Path(__file__).resolve().parents[2]


def _get_generated_root() -> Path:
    """生成内容存放目录 backend/generated/"""
    return _get_backend_root() / "generated"


class VideoItem(BaseModel):
    """单个视频在列表中的展示字段"""

    id: int
    title: str
    poster_url: str
    category: Optional[str] = None
    view_count: int
    updated_at: Optional[str] = None


class VideoListData(BaseModel):
    total: int
    items: List[VideoItem]


class VideoListResponse(BaseModel):
    code: int
    message: str
    data: VideoListData


class VideoCreateRequest(BaseModel):
    """
    手动导入视频素材的请求体。

    external_id 可选，用于与外部系统对齐；本地录入的素材可留空。
    """

    external_id: Optional[str] = Field(
        default=None, description="外部视频系统的唯一 ID（可选）"
    )
    title: str = Field(..., description="视频标题")
    category: Optional[str] = Field(
        default=None, description="视频分类，例如 tutorial / promo"
    )
    poster_url: str = Field(..., description="视频封面 URL")
    view_count: int = Field(
        default=0,
        ge=0,
        description="观看量，手动导入时默认为 0（可选）",
    )


class VideoCreateResponse(BaseModel):
    code: int
    message: str
    data: VideoItem


class SimpleResponse(BaseModel):
    code: int
    message: str
    data: dict = Field(default_factory=dict)


class VideoSyncResponse(BaseModel):
    code: int
    message: str
    data: dict = Field(default_factory=dict)


@router.get(
    "/videos",
    response_model=VideoListResponse,
    summary="查询视频列表",
    description="按分类和分页查询视频素材列表",
)
def list_videos(
    category: Optional[str] = Query(
        default=None,
        description="视频分类，可选；不传则返回所有分类",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="页码，从 1 开始",
    ),
    page_size: int = Query(
        default=20,
        ge=1,
        le=100,
        description="每页数量，默认为 20，最大 100",
    ),
    db: Session = Depends(get_db),
) -> VideoListResponse:
    query = select(Video)

    if category:
        query = query.where(Video.category == category)

    count_stmt = select(func.count()).select_from(query.subquery())
    total: int = db.execute(count_stmt).scalar_one()

    offset = (page - 1) * page_size
    items: List[Video] = (
        db.execute(
            query.order_by(Video.id.desc()).offset(offset).limit(page_size)
        )
        .scalars()
        .all()
    )

    video_items: List[VideoItem] = []
    for v in items:
        updated_at = getattr(v, "updated_at", None)
        video_items.append(
            VideoItem(
                id=v.id,
                title=v.title,
                poster_url=v.poster_url,
                category=v.category,
                view_count=v.view_count,
                updated_at=updated_at.isoformat() if updated_at else None,
            )
        )

    return VideoListResponse(
        code=0,
        message="ok",
        data=VideoListData(total=total, items=video_items),
    )


@router.post(
    "/videos",
    response_model=VideoCreateResponse,
    summary="手动导入视频素材",
    description="通过表单手动录入或导入单条视频素材记录",
)
def create_video(
    payload: VideoCreateRequest,
    db: Session = Depends(get_db),
) -> VideoCreateResponse:
    video = Video(
        external_id=payload.external_id,
        title=payload.title,
        category=payload.category,
        poster_url=payload.poster_url,
        view_count=payload.view_count,
        metadata_={},
        status="active",
    )

    db.add(video)
    db.commit()
    db.refresh(video)

    item = VideoItem(
        id=video.id,
        title=video.title,
        poster_url=video.poster_url,
        category=video.category,
        view_count=video.view_count,
        updated_at=video.updated_at.isoformat() if video.updated_at else None,
    )

    return VideoCreateResponse(code=0, message="ok", data=item)


@router.put(
    "/videos/{video_id}",
    response_model=VideoCreateResponse,
    summary="编辑视频素材",
    description="根据 ID 更新一条视频素材的展示信息",
)
def update_video(
    video_id: int,
    payload: VideoCreateRequest,
    db: Session = Depends(get_db),
) -> VideoCreateResponse:
    video: Optional[Video] = db.get(Video, video_id)
    if not video:
        # 正常使用下不会出现（都是从列表进入编辑），这里返回 code=1 和占位数据
        dummy = VideoItem(
            id=0,
            title="",
            poster_url="",
            category=None,
            view_count=0,
            updated_at=None,
        )
        return VideoCreateResponse(
            code=1,
            message=f"video {video_id} not found",
            data=dummy,
        )

    video.title = payload.title
    video.category = payload.category
    video.poster_url = payload.poster_url
    video.view_count = payload.view_count

    db.add(video)
    db.commit()
    db.refresh(video)

    item = VideoItem(
        id=video.id,
        title=video.title,
        poster_url=video.poster_url,
        category=video.category,
        view_count=video.view_count,
        updated_at=video.updated_at.isoformat() if video.updated_at else None,
    )

    return VideoCreateResponse(code=0, message="ok", data=item)


@router.delete(
    "/videos/{video_id}",
    response_model=SimpleResponse,
    summary="删除视频素材",
    description="根据 ID 删除一条视频素材记录（当前为硬删除）",
)
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
) -> SimpleResponse:
    video: Optional[Video] = db.get(Video, video_id)
    if not video:
        return SimpleResponse(
            code=1,
            message=f"video {video_id} not found",
            data={},
        )

    db.delete(video)
    db.commit()

    return SimpleResponse(code=0, message="ok", data={})


@router.post(
    "/videos/{video_id}/poster",
    response_model=SimpleResponse,
    summary="上传并更新视频封面",
    description="上传本地图片作为封面，并更新对应视频的 poster_url",
)
async def upload_video_poster(
    video_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> SimpleResponse:
    video: Optional[Video] = db.get(Video, video_id)
    if not video:
        return SimpleResponse(
            code=1,
            message=f"video {video_id} not found",
            data={},
        )

    if not file.content_type or not file.content_type.startswith("image/"):
        return SimpleResponse(
            code=1,
            message="仅支持上传图片文件",
            data={},
        )

    original_name = file.filename or "poster"
    ext = Path(original_name).suffix.lower() or ".jpg"

    generated_root = _get_generated_root()
    poster_dir = generated_root / "video_posters" / str(video_id)
    poster_dir.mkdir(parents=True, exist_ok=True)

    filename = f"poster{ext}"
    file_path = poster_dir / filename

    content = await file.read()
    file_path.write_bytes(content)

    poster_url = f"/generated/video_posters/{video_id}/{filename}"
    video.poster_url = poster_url

    db.add(video)
    db.commit()

    return SimpleResponse(
        code=0,
        message="ok",
        data={"poster_url": poster_url},
    )


@router.post(
    "/videos/sync",
    response_model=VideoSyncResponse,
    summary="从外部视频系统同步热门视频",
    description=(
        "根据配置的 EXTERNAL_VIDEO_API_URL 调用外部热门视频排行榜接口，"
        "将结果写入本地 video 表。当前版本实现了基于 STCine 排行榜的同步逻辑。"
    ),
)
def sync_videos(
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description="可选，同步的最大条数（对应排行榜的 page_size）",
    ),
    start_date: Optional[date] = Query(
        default=None,
        description="排行榜查询开始日期（YYYY-MM-DD），不传则默认为昨天",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="排行榜查询结束日期（YYYY-MM-DD），不传则默认为昨天",
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> VideoSyncResponse:
    if not settings.external_video_api_url:
        return VideoSyncResponse(
            code=1,
            message="EXTERNAL_VIDEO_API_URL 未配置，请先在 .env 中设置",
            data={},
        )

    if start_date is None and end_date is None:
        yesterday = date.today() - timedelta(days=1)
        start_date = yesterday
        end_date = yesterday
    elif start_date is None and end_date is not None:
        start_date = end_date
    elif start_date is not None and end_date is None:
        end_date = start_date

    assert start_date is not None and end_date is not None

    base_url = str(settings.external_video_api_url)
    params = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "page_no": 1,
        "page_size": limit,
    }

    try:
        response = httpx.get(base_url, params=params, timeout=10.0)
    except httpx.RequestError as exc:
        return VideoSyncResponse(
            code=1,
            message=f"调用外部排行榜接口失败: {exc}",
            data={},
        )

    if response.status_code != 200:
        return VideoSyncResponse(
            code=1,
            message=f"外部排行榜接口返回非 200 状态码: {response.status_code}",
            data={},
        )

    try:
        payload = response.json()
    except ValueError:
        return VideoSyncResponse(
            code=1,
            message="外部排行榜接口返回的内容不是合法 JSON",
            data={},
        )

    data_obj = payload.get("data") or {}
    lists = data_obj.get("lists") or []
    if not isinstance(lists, list):
        return VideoSyncResponse(
            code=1,
            message="外部排行榜接口返回格式异常：data.lists 不是数组",
            data={},
        )

    imported_count = 0
    updated_count = 0

    for item in lists:
        if not isinstance(item, dict):
            continue

        movie_id = item.get("movie_id")
        if movie_id is None:
            continue

        try:
            movie_id_int = int(movie_id)
        except (TypeError, ValueError):
            continue

        external_id = f"STCine:{movie_id_int}"

        view_count = item.get("view_count") or 0
        try:
            view_count_int = int(view_count)
        except (TypeError, ValueError):
            view_count_int = 0

        ch_name = item.get("ch_name") or item.get("name") or "未命名"
        name_pt = item.get("name")
        langue = item.get("langue")

        stmt = select(Video).where(Video.external_id == external_id)
        existing: Optional[Video] = db.execute(stmt).scalar_one_or_none()

        if existing:
            existing.title = ch_name
            existing.view_count = view_count_int
            existing.category = "stcine_hot"

            metadata = dict(existing.metadata_ or {})
            metadata.update(
                {
                    "source": "stcine",
                    "movie_id": movie_id_int,
                    "name_pt": name_pt,
                    "langue": langue,
                }
            )
            existing.metadata_ = metadata
            updated_count += 1
        else:
            metadata = {
                "source": "stcine",
                "movie_id": movie_id_int,
                "name_pt": name_pt,
                "langue": langue,
            }
            video = Video(
                external_id=external_id,
                title=ch_name,
                category="stcine_hot",
                poster_url="",
                view_count=view_count_int,
                metadata_=metadata,
                status="active",
            )
            db.add(video)
            imported_count += 1

    db.commit()

    return VideoSyncResponse(
        code=0,
        message="ok",
        data={
            "imported_count": imported_count,
            "updated_count": updated_count,
            "source": "stcine",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "limit": limit,
        },
    )

