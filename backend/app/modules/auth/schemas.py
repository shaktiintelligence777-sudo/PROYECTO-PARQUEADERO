from typing import Literal

from pydantic import BaseModel, Field

from app.modules.usuarios.schemas import UsuarioOut


class LoginIn(BaseModel):
    # Se acepta cualquier texto (y no EmailStr) para que un email mal formado reciba el mismo
    # 401 genérico que uno inexistente.
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=256)


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int = Field(description="Segundos de vida del access token")
    usuario: UsuarioOut
