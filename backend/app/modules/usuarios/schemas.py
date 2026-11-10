import uuid

from pydantic import BaseModel, ConfigDict

from app.modules.usuarios.models import Rol


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    nombre: str
    rol: Rol
    activo: bool
