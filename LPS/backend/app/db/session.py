from __future__ import annotations

from typing import Generator, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from ..core.config import get_settings
from .base import Base


def get_engine() -> Engine:
    """
    Create the SQLAlchemy engine.

    Engine creation is cheap and stateless, but in practice you may
    want to cache it similarly to settings. For this first milestone
    we keep it simple and create a new engine when needed.
    """
    settings = get_settings()
    return create_engine(
        settings.database_url.unicode_string(),
        pool_pre_ping=True,
    )


# Global session factory used by the application.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a SQLAlchemy session per request.

    Usage in FastAPI routes:

        from fastapi import Depends
        from sqlalchemy.orm import Session
        from app.db.session import get_db

        @router.get("/items")
        def list_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Ensure all tables defined on the Base metadata are created.

    In production we will rely on Alembic migrations instead of this
    helper, but it is convenient for early local development.
    """
    engine = get_engine()
    Base.metadata.create_all(bind=engine)


def get_db_health() -> Tuple[bool, dict]:
    """
    Perform a lightweight database connectivity check.

    Returns:
        (ok, details) where:
          - ok is True when the check succeeded.
          - details contains diagnostic information.
    """
    engine = get_engine()

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            value = result.scalar_one()

        return True, {"status": "connected", "test_query_result": int(value)}
    except SQLAlchemyError as exc:
        return False, {
            "status": "error",
            "error_type": exc.__class__.__name__,
            "error_message": str(exc),
        }
