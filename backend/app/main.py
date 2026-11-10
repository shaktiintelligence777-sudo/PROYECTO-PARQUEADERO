"""Punto de entrada de la API."""

from fastapi import APIRouter, Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.router import router as auth_router

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    es_produccion = settings.entorno == "produccion"

    app = FastAPI(
        title="Parqueadero de motos · API",
        version="0.1.0",
        docs_url=None if es_produccion else "/docs",
        redoc_url=None,
        openapi_url=None if es_produccion else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # los tokens viajan en la cabecera Authorization, no en cookies
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def cabeceras_seguridad(request: Request, call_next):  # type: ignore[no-untyped-def]
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if es_produccion:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", tags=["sistema"])
    def health(response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"estado": "error", "base_de_datos": "no disponible"}
        return {"estado": "ok", "base_de_datos": "ok"}

    api.include_router(auth_router)
    app.include_router(api)
    return app


app = create_app()
