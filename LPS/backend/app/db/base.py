from __future__ import annotations

"""
SQLAlchemy declarative base and model imports.

This module defines the shared Base class for all ORM models and
collects model imports so that Alembic's autogenerate feature can
discover them.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""


# Model imports (added gradually as entities are implemented).
# These imports are intentionally placed at the bottom to avoid
# circular import issues during application startup.
from . import models  # noqa: F401,E402  # isort: skip


