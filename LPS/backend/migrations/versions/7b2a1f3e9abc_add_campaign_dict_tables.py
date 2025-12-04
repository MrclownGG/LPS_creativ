"""add campaign channel/region dict tables

Revision ID: 7b2a1f3e9abc
Revises: 27cb92c5c256
Create Date: 2025-11-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b2a1f3e9abc"
down_revision: Union[str, None] = "27cb92c5c256"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaign_channel_dict",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_campaign_channel_code"),
    )
    op.create_index(
        "idx_campaign_channel_status",
        "campaign_channel_dict",
        ["status"],
        unique=False,
    )

    op.create_table(
        "campaign_region_dict",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_campaign_region_code"),
    )
    op.create_index(
        "idx_campaign_region_status",
        "campaign_region_dict",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_campaign_region_status", table_name="campaign_region_dict")
    op.drop_table("campaign_region_dict")

    op.drop_index("idx_campaign_channel_status", table_name="campaign_channel_dict")
    op.drop_table("campaign_channel_dict")

