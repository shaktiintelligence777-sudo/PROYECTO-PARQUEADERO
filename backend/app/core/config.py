"""Configuración de la aplicación, leída de variables de entorno (o de un archivo .env)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def normalizar_database_url(url: str) -> str:
    """Los proveedores (Render, Neon) entregan postgres:// o postgresql://; SQLAlchemy necesita
    el driver asíncrono explícito."""
    for prefijo in ("postgres://", "postgresql://", "postgresql+psycopg://"):
        if url.startswith(prefijo):
            return "postgresql+asyncpg://" + url[len(prefijo) :]
    return url


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True
    )

    entorno: Literal["desarrollo", "pruebas", "produccion"] = Field(
        default="desarrollo", alias="ENTORNO"
    )
    database_url: str = Field(alias="DATABASE_URL")
    jwt_secreto: str = Field(alias="JWT_SECRETO", min_length=32)
    service_token: str = Field(alias="SERVICE_TOKEN", min_length=32)
    cors_origenes: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:5173"], alias="CORS_ORIGENES"
    )
    zona_horaria: str = Field(default="America/Bogota", alias="ZONA_HORARIA")

    # B-03
    jwt_minutos_acceso: int = Field(default=15, alias="JWT_MINUTOS_ACCESO", gt=0)
    refresh_dias: int = Field(default=30, alias="REFRESH_DIAS", gt=0)
    login_max_fallos_email: int = Field(default=5, alias="LOGIN_MAX_FALLOS_EMAIL", gt=0)
    login_max_fallos_ip: int = Field(default=20, alias="LOGIN_MAX_FALLOS_IP", gt=0)
    login_ventana_minutos: int = Field(default=15, alias="LOGIN_VENTANA_MINUTOS", gt=0)

    @field_validator("database_url")
    @classmethod
    def _normalizar_database_url(cls, v: str) -> str:
        return normalizar_database_url(v)

    @field_validator("cors_origenes", mode="before")
    @classmethod
    def _separar_origenes(cls, v: object) -> object:
        if isinstance(v, str):
            v = [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        if isinstance(v, list) and "*" in v:
            raise ValueError("CORS_ORIGENES no puede ser '*'")
        return v


@lru_cache
def obtener_ajustes() -> Ajustes:
    return Ajustes()
