"""replace created_by string with created_by_id fk

Revision ID: 6f3c1d2f4a3b
Revises: 0c3b68a59f6c, 1e7b4c5d6e7f
Create Date: 2025-12-10 16:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f3c1d2f4a3b"
down_revision: Union[str, None] = ("0c3b68a59f6c", "1e7b4c5d6e7f")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_ADMIN_ID = 2  # existing admin user id


def upgrade() -> None:
    # workflow
    op.add_column(
        "workflow",
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "idx_workflow_creator_id", "workflow", ["created_by_id"], unique=False
    )
    op.create_foreign_key(
        "fk_workflow_user",
        "workflow",
        "app_user",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        sa.text(
            "UPDATE workflow SET created_by_id = :admin_id WHERE created_by_id IS NULL"
        ).bindparams(admin_id=DEFAULT_ADMIN_ID)
    )
    op.drop_index("idx_workflow_creator", table_name="workflow")
    op.drop_column("workflow", "created_by")

    # campaign
    op.add_column(
        "campaign",
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "idx_campaign_creator_id", "campaign", ["created_by_id"], unique=False
    )
    op.create_foreign_key(
        "fk_campaign_user",
        "campaign",
        "app_user",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        sa.text(
            "UPDATE campaign SET created_by_id = :admin_id WHERE created_by_id IS NULL"
        ).bindparams(admin_id=DEFAULT_ADMIN_ID)
    )
    op.drop_index("idx_campaign_creator", table_name="campaign")
    op.drop_column("campaign", "created_by")


def downgrade() -> None:
    # workflow
    op.add_column(
        "workflow",
        sa.Column("created_by", sa.String(length=100), nullable=False, server_default="")
    )
    op.execute(sa.text("UPDATE workflow SET created_by = 'system' WHERE created_by = ''"))
    op.drop_constraint("fk_workflow_user", "workflow", type_="foreignkey")
    op.drop_index("idx_workflow_creator_id", table_name="workflow")
    op.drop_column("workflow", "created_by_id")
    op.create_index(
        "idx_workflow_creator", "workflow", ["created_by"], unique=False
    )

    # campaign
    op.add_column(
        "campaign",
        sa.Column("created_by", sa.String(length=100), nullable=False, server_default="")
    )
    op.execute(sa.text("UPDATE campaign SET created_by = 'system' WHERE created_by = ''"))
    op.drop_constraint("fk_campaign_user", "campaign", type_="foreignkey")
    op.drop_index("idx_campaign_creator_id", table_name="campaign")
    op.drop_column("campaign", "created_by_id")
    op.create_index(
        "idx_campaign_creator", "campaign", ["created_by"], unique=False
    )
