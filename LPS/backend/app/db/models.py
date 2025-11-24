from __future__ import annotations

"""
ORM model definitions for the LPS Creativ system.

The models are derived directly from the database blueprint document
located at: LPS_creativ/Test/数据库蓝图文档.md
"""

from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Video(Base):
    """
    视频素材库表 (`video`)

    对应蓝图中的实体 1：video。
    """

    __tablename__ = "video"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    external_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(50))
    poster_url: Mapped[str] = mapped_column(Text, nullable=False)
    view_count: Mapped[int] = mapped_column(BigInteger, default=0)
    # Column name is "metadata" in the database, but the attribute
    # name cannot literally be "metadata" because DeclarativeBase
    # reserves that name for SQLAlchemy's MetaData object.
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_video_category", "category"),
        Index("idx_video_status", "status"),
    )


class Template(Base):
    """
    落地页模板库表 (`template`)

    对应蓝图中的实体 2：template。
    """

    __tablename__ = "template"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text)
    html_file_path: Mapped[str] = mapped_column(Text, nullable=False)
    max_videos: Mapped[int] = mapped_column(Integer, nullable=False)
    static_assets_path: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )


class Workflow(Base):
    """
    工作流 / 批次实例表 (`workflow`)

    对应蓝图中的实体 3：workflow。
    """

    __tablename__ = "workflow"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_workflow_creator", "created_by"),
        Index("idx_workflow_status", "status"),
    )


class LandingPage(Base):
    """
    落地页实例表 (`landing_page`)

    对应蓝图中的实体 4：landing_page。
    """

    __tablename__ = "landing_page"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    workflow_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("workflow.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("template.id"), nullable=False
    )
    selected_video_ids: Mapped[List[int]] = mapped_column(
        ARRAY(BigInteger), nullable=False
    )
    generated_page_url: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("workflow_id", "template_id", name="uq_workflow_template"),
        Index("idx_landing_page_workflow", "workflow_id"),
        Index("idx_landing_page_template", "template_id"),
    )


class AdImageLibrary(Base):
    """
    广告素材总库表 (`ad_image_library`)

    对应蓝图中的实体 5：ad_image_library。
    """

    __tablename__ = "ad_image_library"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(255))
    dimensions: Mapped[Optional[str]] = mapped_column(String(20))
    file_size: Mapped[Optional[int]] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String(100), nullable=False)
    upload_batch: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )

    __table_args__ = (
        Index("idx_ad_image_author", "author"),
        Index("idx_ad_image_batch", "upload_batch"),
    )


class WorkflowAdMap(Base):
    """
    批次与广告素材关联表 (`workflow_ad_map`)

    对应蓝图中的实体 6：workflow_ad_map。
    """

    __tablename__ = "workflow_ad_map"

    workflow_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("workflow.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ad_image_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("ad_image_library.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        Index("idx_wam_workflow", "workflow_id"),
        Index("idx_wam_ad_image", "ad_image_id"),
    )


class Campaign(Base):
    """
    投放计划表 (`campaign`)

    对应蓝图中的实体 7：campaign。
    """

    __tablename__ = "campaign"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    channels: Mapped[List[str]] = mapped_column(ARRAY(Text), nullable=False)
    regions: Mapped[List[str]] = mapped_column(ARRAY(Text), nullable=False)
    launch_time: Mapped[Optional[DateTime]] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_by: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now()
    )
    config: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (Index("idx_campaign_creator", "created_by"),)


class CampaignWorkflowMap(Base):
    """
    投放计划与工作流关联表 (`campaign_workflow_map`)

    对应蓝图中的实体 8：campaign_workflow_map。
    """

    __tablename__ = "campaign_workflow_map"

    campaign_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("campaign.id", ondelete="CASCADE"),
        primary_key=True,
    )
    workflow_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("workflow.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        Index("idx_cwm_campaign", "campaign_id"),
        Index("idx_cwm_workflow", "workflow_id"),
    )

