"""merge heads

Revision ID: 124d915bb4b6
Revises: 0dd6a08c3008, 6f3c1d2f4a3b
Create Date: 2025-12-10 15:18:42.548200

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '124d915bb4b6'
down_revision: Union[str, None] = ('0dd6a08c3008', '6f3c1d2f4a3b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
