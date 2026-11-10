"""Motor asíncrono y sesiones de SQLAlchemy."""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import obtener_ajustes


@lru_cache
def obtener_motor() -> AsyncEngine:
    return create_async_engine(
        obtener_ajustes().database_url, pool_pre_ping=True, pool_size=5, max_overflow=5
    )


@lru_cache
def obtener_fabrica_sesiones() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(obtener_motor(), expire_on_commit=False, autoflush=False)


async def obtener_sesion() -> AsyncIterator[AsyncSession]:
    """Dependencia de FastAPI: una sesión por petición."""
    async with obtener_fabrica_sesiones()() as sesion:
        yield sesion
