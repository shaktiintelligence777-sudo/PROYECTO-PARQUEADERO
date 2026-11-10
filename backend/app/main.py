"""Punto de entrada de la API."""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import obtener_ajustes
from app.core.errores import registrar_manejadores
from app.modules.auth.router import router as auth_router
from app.modules.salud.router import VERSION
from app.modules.salud.router import router as salud_router

PREFIJO_API = "/api/v1"


def crear_app() -> FastAPI:
    ajustes = obtener_ajustes()
    es_produccion = ajustes.entorno == "produccion"

    app = FastAPI(
        title="API Parqueadero de motos",
        version=VERSION,
        docs_url=None if es_produccion else "/docs",
        redoc_url=None,
        openapi_url=None if es_produccion else "/openapi.json",
    )
    registrar_manejadores(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ajustes.cors_origenes,
        allow_credentials=False,  # los tokens viajan en Authorization, no en cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def cabeceras_seguridad(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if es_produccion:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response

    api = APIRouter(prefix=PREFIJO_API)
    api.include_router(salud_router)
    api.include_router(auth_router)
    app.include_router(api)
    return app


app = crear_app()
