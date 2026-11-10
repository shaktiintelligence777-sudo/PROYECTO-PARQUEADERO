"""Motor asíncrono y sesiones de SQLAlchemy."""

import ssl
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import obtener_ajustes

# Plan gratuito de Neon: pocas conexiones. Nunca más de 5 a la vez (B-09, regla 5).
TAMANO_POOL = 5

# Modos de libpq que no garantizan TLS.
_SIN_TLS = {"disable", "allow", "prefer", "false", "0", "no", "off"}
# Parámetros de libpq que asyncpg no entiende: se interpretan aquí y se quitan de la URL.
_PARAMETROS_TLS = ("sslmode", "ssl", "channel_binding")


class ConexionInsegura(RuntimeError):
    """La URL de la base desactiva TLS en producción."""


def contexto_tls() -> ssl.SSLContext:
    """TLS con verificación de certificado y de nombre de host (equivale a `verify-full`)."""
    return ssl.create_default_context()


def preparar_conexion(url: str, entorno: str) -> tuple[str, dict[str, Any]]:
    """Devuelve la URL sin los parámetros TLS de libpq y los `connect_args` para asyncpg.

    Neon entrega URLs con `?sslmode=require&channel_binding=require`, que asyncpg no acepta.
    En `produccion` siempre se exige TLS verificado, y si la URL lo desactiva el arranque
    falla con un mensaje claro.
    """
    u = make_url(url)
    modo = next(
        (str(u.query[p]).lower() for p in ("sslmode", "ssl") if p in u.query),
        None,
    )
    limpia = u.difference_update_query(_PARAMETROS_TLS).render_as_string(hide_password=False)
    if entorno == "produccion":
        if modo in _SIN_TLS:
            raise ConexionInsegura(
                f"DATABASE_URL desactiva TLS (sslmode={modo}). En producción la conexión a la "
                "base debe ir cifrada y verificada: usa sslmode=require o sslmode=verify-full."
            )
        return limpia, {"ssl": contexto_tls()}
    if modo is None or modo in _SIN_TLS:
        return limpia, {}
    return limpia, {"ssl": contexto_tls()}


def crear_motor(url: str, entorno: str, **opciones: Any) -> AsyncEngine:
    limpia, connect_args = preparar_conexion(url, entorno)
    return create_async_engine(limpia, connect_args=connect_args, **opciones)


@lru_cache
def obtener_motor() -> AsyncEngine:
    ajustes = obtener_ajustes()
    return crear_motor(
        ajustes.database_url,
        ajustes.entorno,
        pool_pre_ping=True,
        pool_size=TAMANO_POOL,
        max_overflow=0,
    )


@lru_cache
def obtener_fabrica_sesiones() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(obtener_motor(), expire_on_commit=False, autoflush=False)


async def obtener_sesion() -> AsyncIterator[AsyncSession]:
    """Dependencia de FastAPI: una sesión por petición."""
    async with obtener_fabrica_sesiones()() as sesion:
        yield sesion
