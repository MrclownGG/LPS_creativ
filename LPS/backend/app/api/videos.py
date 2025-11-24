from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Video
from app.db.session import get_db

router = APIRouter(tags=["videos"])


class VideoItem(BaseModel):
    """单个视频的对外展示字段。"""

    id: int
    title: str
    poster_url: str
    category: Optional[str] = None
    view_count: int


class VideoListData(BaseModel):
    """视频列表响应中的 data 部分。"""

    total: int
    items: List[VideoItem]


class VideoListResponse(BaseModel):
    """
    视频列表接口的标准返回结构。

    与全局 `{code, message, data}` 契约保持一致。
    """

    code: int
    message: str
    data: VideoListData


class VideoCreateRequest(BaseModel):
    """
    手动导入视频素材的请求体。

    external_id 可以留空（例如手填的素材），如果来源于外部系统，可以带上以便去重。
    """

    external_id: Optional[str] = Field(
        default=None, description="外部视频系统的唯一 ID，可选"
    )
    title: str = Field(..., description="视频标题")
    category: Optional[str] = Field(
        default=None, description="视频分类，例如 tutorial/promo"
    )
    poster_url: str = Field(..., description="视频封面图 URL")
    view_count: int = Field(
        default=0,
        ge=0,
        description="观看量，手动导入时默认 0，可选填",
    )


class VideoCreateResponse(BaseModel):
    """手动导入视频的响应结构。"""

    code: int
    message: str
    data: VideoItem


class SimpleResponse(BaseModel):
    """通用的简单响应结构，用于删除等不返回实体数据的场景。"""

    code: int
    message: str
    data: dict = Field(default_factory=dict)


@router.get(
    "/videos",
    response_model=VideoListResponse,
    summary="查询视频列表",
    description="按分类和分页查询视频素材列表。",
)
def list_videos(
    category: Optional[str] = Query(
        default=None,
        description="视频分类，可选。不传则返回所有分类。",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="页码，从 1 开始。",
    ),
    page_size: int = Query(
        default=20,
        ge=1,
        le=100,
        description="每页数量，默认 20，最大 100。",
    ),
    db: Session = Depends(get_db),
) -> VideoListResponse:
    """
    视频列表查询接口实现。

    - 支持按分类筛选
    - 支持分页
    """
    query = select(Video)

    if category:
        query = query.where(Video.category == category)

    # 统计总数
    count_stmt = select(func.count()).select_from(query.subquery())
    total: int = db.execute(count_stmt).scalar_one()

    # 分页查询
    offset = (page - 1) * page_size
    items: List[Video] = (
        db.execute(
            query.order_by(Video.id.desc()).offset(offset).limit(page_size)
        )
        .scalars()
        .all()
    )

    video_items = [
        VideoItem(
            id=v.id,
            title=v.title,
            poster_url=v.poster_url,
            category=v.category,
            view_count=v.view_count,
        )
        for v in items
    ]

    return VideoListResponse(
        code=0,
        message="ok",
        data=VideoListData(total=total, items=video_items),
    )


@router.post(
    "/videos",
    response_model=VideoCreateResponse,
    summary="手动导入视频素材",
    description="通过表单手动录入或导入单条视频素材记录。",
)
def create_video(
    payload: VideoCreateRequest,
    db: Session = Depends(get_db),
) -> VideoCreateResponse:
    """
    手动导入视频素材。

    - external_id 可选，主要用于与外部系统对齐
    - metadata 统一初始化为空对象
    - status 统一初始化为 'active'
    """
    video = Video(
        external_id=payload.external_id,
        title=payload.title,
        category=payload.category,
        poster_url=payload.poster_url,
        view_count=payload.view_count,
        metadata_={},  # 初始元数据为空对象
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
    )

    return VideoCreateResponse(code=0, message="ok", data=item)


@router.delete(
    "/videos/{video_id}",
    response_model=SimpleResponse,
    summary="删除视频素材",
    description="根据 ID 删除一条视频素材记录。",
)
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
) -> SimpleResponse:
    """
    删除单条视频素材。

    当前实现为硬删除（直接从 video 表中删除），后续如需改为软删除，
    可调整为更新 status 字段而不是删除记录。
    """
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
