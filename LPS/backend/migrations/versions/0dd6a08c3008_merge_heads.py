"""merge heads

Revision ID: 0dd6a08c3008
Revises: 1e7b4c5d6e7f, 0c3b68a59f6c
Create Date: 2025-12-10 13:41:50.851609

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0dd6a08c3008'
down_revision: Union[str, None] = ('1e7b4c5d6e7f', '0c3b68a59f6c')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
