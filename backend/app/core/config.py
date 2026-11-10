"""Configuración de la aplicación, leída de variables de entorno (o de un archivo .env)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def normalizar_database_url(url: str) -> str:
    """Los proveedores (Render, Neon, Supabase) entregan postgres:// o postgresql://;
    SQLAlchemy necesita el driver explícito."""
    for prefijo in ("postgres://", "postgresql://"):
        if url.startswith(prefijo):
            return "postgresql+psycopg://" + url[len(prefijo) :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    entorno: Literal["desarrollo", "pruebas", "produccion"] = Field(
        default="desarrollo", alias="ENTORNO"
    )

    database_url: str = Field(alias="DATABASE_URL")

    jwt_secret: str = Field(alias="JWT_SECRET", min_length=32)
    jwt_algoritmo: str = "HS256"
    jwt_emisor: str = "parqueadero-api"
    access_token_minutos: int = Field(default=15, alias="ACCESS_TOKEN_MINUTOS", gt=0)
    refresh_token_dias: int = Field(default=14, alias="REFRESH_TOKEN_DIAS", gt=0)

    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list, alias="CORS_ORIGINS")

    login_max_intentos_email: int = Field(default=5, alias="LOGIN_MAX_INTENTOS_EMAIL", gt=0)
    login_max_intentos_ip: int = Field(default=20, alias="LOGIN_MAX_INTENTOS_IP", gt=0)
    login_ventana_segundos: int = Field(default=300, alias="LOGIN_VENTANA_SEGUNDOS", gt=0)

    internal_job_token: str | None = Field(default=None, alias="INTERNAL_JOB_TOKEN")

    zona_horaria: str = Field(default="America/Bogota", alias="ZONA_HORARIA")
    dias_por_vencer: int = Field(default=3, alias="DIAS_POR_VENCER", ge=0)

    @field_validator("database_url")
    @classmethod
    def _normalizar_database_url(cls, v: str) -> str:
        return normalizar_database_url(v)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _separar_origenes(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        return v

    @field_validator("internal_job_token")
    @classmethod
    def _token_interno_largo(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 32:
            raise ValueError("INTERNAL_JOB_TOKEN debe tener al menos 32 caracteres")
        return v or None

    @model_validator(mode="after")
    def _reglas_produccion(self) -> "Settings":
        if self.entorno == "produccion":
            if "*" in self.cors_origins:
                raise ValueError("En producción CORS_ORIGINS no puede ser '*'")
            if "sslmode=disable" in self.database_url:
                raise ValueError("En producción la conexión a PostgreSQL debe usar TLS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
