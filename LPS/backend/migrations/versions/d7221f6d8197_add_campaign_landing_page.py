"""add campaign landing page

Revision ID: d7221f6d8197
Revises: 9d3e7f1c4b21
Create Date: 2025-12-09 11:24:36.282612

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7221f6d8197'
down_revision: Union[str, None] = '9d3e7f1c4b21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "campaign_landing_page",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "campaign_id",
            sa.BigInteger(),
            sa.ForeignKey("campaign.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "landing_page_id",
            sa.BigInteger(),
            sa.ForeignKey("landing_page.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "channel_id",
            sa.BigInteger(),
            sa.ForeignKey("campaign_channel_dict.id"),
            nullable=True,
        ),
        sa.Column("channel_external_id", sa.String(100)),
        sa.Column("channel_token", sa.Text()),
        sa.Column("page_url", sa.Text(), nullable=False),
        sa.Column("package_url", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "campaign_id",
            "landing_page_id",
            name="uq_campaign_landing_page",
        ),
    )
    op.create_index(
        "idx_clp_campaign",
        "campaign_landing_page",
        ["campaign_id"],
    )


def downgrade():
    op.drop_index("idx_clp_campaign", table_name="campaign_landing_page")
    op.drop_table("campaign_landing_page")