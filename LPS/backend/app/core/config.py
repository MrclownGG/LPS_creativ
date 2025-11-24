import functools
import os
from typing import Literal

from dotenv import load_dotenv
from pydantic import AnyUrl, BaseModel, ValidationError


class Settings(BaseModel):
    """
    Application settings loaded from environment variables.

    Only a minimal subset is defined for the first milestone.
    New settings can be added here as the project grows.
    """

    environment: Literal["local", "dev", "prod"] = "local"
    api_version: str = "0.1.0"

    # Example:
    # postgresql+psycopg://user:password@localhost:5432/lps_creativ
    database_url: AnyUrl


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Load and cache settings.

    The first time this function is called it will load
    environment variables (optionally from a .env file) and
    construct the Settings object.
    """
    # Load .env from the backend directory or project root if present.
    # This is safe to call multiple times.
    load_dotenv()

    try:
        return Settings(
            environment=os.getenv("ENVIRONMENT", "local"),
            api_version=os.getenv("API_VERSION", "0.1.0"),
            database_url=os.environ["DATABASE_URL"],
        )
    except KeyError as exc:
        missing = ", ".join([str(exc)])
        raise RuntimeError(
            f"Missing required environment variable(s): {missing}"
        ) from exc
    except ValidationError as exc:
        raise RuntimeError(f"Invalid configuration: {exc}") from exc

