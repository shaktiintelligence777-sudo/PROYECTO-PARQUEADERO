"""Configuración de la aplicación, leída de variables de entorno (o de un archivo .env)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
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

    # B-07: correo
    correo_proveedor: Literal["consola", "smtp", "resend"] = Field(
        default="consola", alias="CORREO_PROVEEDOR"
    )
    correo_remitente: str | None = Field(default=None, alias="CORREO_REMITENTE")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_puerto: int = Field(default=587, alias="SMTP_PUERTO", gt=0, lt=65536)
    smtp_usuario: str | None = Field(default=None, alias="SMTP_USUARIO")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")

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

    @model_validator(mode="after")
    def _validar_correo(self) -> "Ajustes":
        faltan: list[str] = []
        if self.correo_proveedor != "consola" and not self.correo_remitente:
            faltan.append("CORREO_REMITENTE")
        if self.correo_proveedor == "smtp" and not self.smtp_host:
            faltan.append("SMTP_HOST")
        if self.correo_proveedor == "resend" and not self.resend_api_key:
            faltan.append("RESEND_API_KEY")
        if faltan:
            raise ValueError(f"CORREO_PROVEEDOR={self.correo_proveedor} exige: {', '.join(faltan)}")
        return self


@lru_cache
def obtener_ajustes() -> Ajustes:
    return Ajustes()
