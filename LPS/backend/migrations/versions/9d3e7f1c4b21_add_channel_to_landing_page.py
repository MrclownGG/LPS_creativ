"""add channel_id column to landing_page

Revision ID: 9d3e7f1c4b21
Revises: 8c3f9a1b2d34
Create Date: 2025-12-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d3e7f1c4b21"
down_revision: Union[str, None] = "8c3f9a1b2d34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为 landing_page 表增加 channel_id 字段，用于记录选中的单一渠道"""
    op.add_column(
        "landing_page",
        sa.Column("channel_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_landing_page_channel",
        "landing_page",
        "campaign_channel_dict",
        ["channel_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_landing_page_channel",
        "landing_page",
        type_="foreignkey",
    )
    op.drop_column("landing_page", "channel_id")

