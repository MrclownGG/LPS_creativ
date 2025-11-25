import functools
import os
from typing import Literal, Optional

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

    # 外部视频系统同步（可选）
    # 例如：热门视频排行榜 API 的基础 URL
    external_video_api_url: Optional[AnyUrl] = None
    # 若对方接口需要鉴权，可在此配置 token（如 Bearer Token / API Key 等）
    external_video_api_token: Optional[str] = None


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
            external_video_api_url=os.getenv("EXTERNAL_VIDEO_API_URL") or None,
            external_video_api_token=os.getenv("EXTERNAL_VIDEO_API_TOKEN") or None,
        )
    except KeyError as exc:
        missing = ", ".join([str(exc)])
        raise RuntimeError(
            f"Missing required environment variable(s): {missing}"
        ) from exc
    except ValidationError as exc:
        raise RuntimeError(f"Invalid configuration: {exc}") from exc
