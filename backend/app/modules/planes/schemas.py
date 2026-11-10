import uuid
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from app.core.esquemas import Dinero, Entrada, Parche, Texto


class Plan(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    duracion_dias: int
    precio: int
    activo: bool
    creado_en: datetime


class PlanRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    duracion_dias: int
    precio: int


class ListaPlanes(BaseModel):
    items: list[Plan]


class PlanCrear(Entrada):
    nombre: Texto = Field(min_length=2, max_length=60)
    duracion_dias: int = Field(ge=1, le=366, strict=True)
    precio: Dinero


class PlanEditar(Parche):
    NO_ANULABLES: ClassVar[frozenset[str]] = frozenset(
        {"nombre", "duracion_dias", "precio", "activo"}
    )

    nombre: Texto | None = Field(default=None, min_length=2, max_length=60)
    duracion_dias: int | None = Field(default=None, ge=1, le=366, strict=True)
    precio: Dinero | None = None
    activo: bool | None = None
