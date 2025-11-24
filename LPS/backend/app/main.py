from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import Settings, get_settings
from .db.session import get_db_health
from .api.videos import router as videos_router
from .api.templates import router as templates_router
from .api.workflows import router as workflows_router


def create_app() -> FastAPI:
    """
    Application factory.

    Having a factory makes it easier to configure the app
    differently for tests, local development, etc.
    """
    settings = get_settings()

    app = FastAPI(
        title="LPS Creativ API",
        description="Backend API for the LPS Creativ landing page system.",
        version=settings.api_version,
    )

    # CORS 设置：允许本地前端（Vite dev server）访问后端 API。
    # 后续如果有正式域名，可以在这里补充。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health endpoints (not under /api prefix on purpose, so that
    # they can be probed easily by infrastructure tools).
    @app.get("/health")
    async def health_check(settings: Settings = Depends(get_settings)) -> dict:
        """
        Simple health endpoint.

        Returns static information so you can quickly verify
        that the API process is up and routing works.
        """
        return {
            "code": 0,
            "message": "ok",
            "data": {
                "service": "lps-backend",
                "version": settings.api_version,
                "environment": settings.environment,
            },
        }

    @app.get("/db-check")
    async def db_check() -> dict:
        """
        Database connectivity check.

        Tries to open a connection and run a trivial query.
        If it fails, you will get an error message instead.
        """
        ok, details = get_db_health()

        if ok:
            return {
                "code": 0,
                "message": "ok",
                "data": details,
            }

        return {
            "code": 1,
            "message": "database connection failed",
            "data": details,
        }

    # Business APIs are grouped under the /api prefix.
    app.include_router(videos_router, prefix="/api")
    app.include_router(templates_router, prefix="/api")
    app.include_router(workflows_router, prefix="/api")

    # Static files: expose generated landing pages and template静态资源
    backend_root = Path(__file__).resolve().parent.parent

    # Directory for generated landing page HTML files
    generated_dir = backend_root / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/generated", StaticFiles(directory=str(generated_dir)), name="generated")

    # Directory for template static assets (css/js/images 等)
    templates_root = backend_root.parent / "templates"
    if templates_root.exists():
        app.mount(
            "/templates",
            StaticFiles(directory=str(templates_root)),
            name="templates-static",
        )

    return app


app = create_app()
