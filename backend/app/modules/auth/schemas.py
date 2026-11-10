import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.tipos import Rol


class Entrada(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginEntrada(Entrada):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def _normalizar_email(cls, v: object) -> object:
        return v.strip().lower() if isinstance(v, str) else v


class RefreshEntrada(Entrada):
    refresh_token: str = Field(min_length=20, max_length=512)


class CambioPasswordEntrada(Entrada):
    password_actual: str = Field(min_length=1, max_length=128)
    password_nueva: str = Field(min_length=8, max_length=128)


class Usuario(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    nombre: str
    rol: Rol
    activo: bool
    creado_en: datetime


class Sesion(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int
    usuario: Usuario
