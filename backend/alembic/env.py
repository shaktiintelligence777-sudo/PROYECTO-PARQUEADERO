import asyncio
from logging.config import fileConfig

from alembic import context
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import normalizar_database_url
from app.db.modelos import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


class _AjustesBD(BaseSettings):
    """Solo lo que necesitan las migraciones (no exige JWT_SECRETO ni el resto)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str | None = Field(default=None, alias="DATABASE_URL")


def _database_url() -> str:
    # La URL puede venir por config (lo usan las pruebas), por variable de entorno o por .env.
    url = config.get_main_option("sqlalchemy.url") or _AjustesBD().database_url
    if not url:
        raise RuntimeError("Define DATABASE_URL para ejecutar migraciones")
    return normalizar_database_url(url)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _migrar(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    motor = create_async_engine(_database_url(), poolclass=pool.NullPool)
    async with motor.connect() as connection:
        await connection.run_sync(_migrar)
    await motor.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
