from __future__ import annotations

"""
Alembic migration environment.

This file wires Alembic to the application's SQLAlchemy models and
configuration so that migrations can be generated from the ORM
definitions in `app.db.models`.
"""

from logging.config import fileConfig
from typing import Any, Dict

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base  # imports all models via app.db.models

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the application's metadata for autogenerate support.
target_metadata = Base.metadata


def get_url() -> str:
    """Return the database URL from application settings."""
    settings = get_settings()
    return settings.database_url.unicode_string()


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    configuration: Dict[str, Any] = config.get_section(
        config.config_ini_section, {}
    )
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
