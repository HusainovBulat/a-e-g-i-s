"""FastAPI application factory: ``uvicorn app.main:app --host 0.0.0.0 --port 8000``."""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config

# core_math.py / rag_llm.py live in the project root (owned by the AI/DS track).
if str(config.PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(config.PROJECT_ROOT))

from .api import router  # noqa: E402
from .data_store import get_store  # noqa: E402
from .ml.models import ModelRegistry  # noqa: E402
from .service import AegisService, ServiceError  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aegis")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    models = await asyncio.to_thread(ModelRegistry)  # loads .pkl or trains from data/ (~1-3 s)
    service = AegisService(store, models)
    app.state.service = service
    await service.start()
    log.info("A.E.G.I.S. Base Server ready — models: %s",
             {k: v["source"] for k, v in models.info().items()})
    try:
        yield
    finally:
        await service.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="A.E.G.I.S. Base Server",
        version="1.0.0",
        description="Autonomous EVA Gait, Ischemia & Survival System — NASA Space Apps 2026",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=config.CORS_ORIGINS != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ServiceError)
    async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {"name": "A.E.G.I.S. Base Server", "docs": "/docs", "health": "/health"}

    app.include_router(router)
    app.include_router(router, prefix="/api")
    return app


app = create_app()
