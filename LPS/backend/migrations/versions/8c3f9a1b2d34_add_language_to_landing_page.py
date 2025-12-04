"""add language column to landing_page

Revision ID: 8c3f9a1b2d34
Revises: 7b2a1f3e9abc
Create Date: 2025-12-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8c3f9a1b2d34"
down_revision: Union[str, None] = "7b2a1f3e9abc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 为现有 landing_page 表增加 language 字段，默认 zh
    op.add_column(
        "landing_page",
        sa.Column(
            "language",
            sa.String(length=10),
            nullable=False,
            server_default="zh",
        ),
    )


def downgrade() -> None:
    op.drop_column("landing_page", "language")

