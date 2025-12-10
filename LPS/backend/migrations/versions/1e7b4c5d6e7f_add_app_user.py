"""add app_user table

Revision ID: 1e7b4c5d6e7f
Revises: d7221f6d8197
Create Date: 2025-12-11 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1e7b4c5d6e7f"
down_revision = "d7221f6d8197"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_user",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("nickname", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="operator"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("username", name="uq_app_user_username"),
    )
    op.create_index("idx_user_username", "app_user", ["username"])
    op.create_index("idx_user_status", "app_user", ["status"])


def downgrade() -> None:
    op.drop_index("idx_user_status", table_name="app_user")
    op.drop_index("idx_user_username", table_name="app_user")
    op.drop_table("app_user")
