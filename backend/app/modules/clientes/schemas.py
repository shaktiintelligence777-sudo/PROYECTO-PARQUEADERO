import uuid
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field

from app.core.esquemas import (
    Documento,
    EmailOpcional,
    Entrada,
    Parche,
    Telefono,
    Texto,
    TextoOpcional,
)
from app.core.paginacion import Pagina
from app.modules.membresias.resumen import MembresiaResumen
from app.modules.motos.schemas import Moto, MotoCrear


class ClienteBase(BaseModel):
    id: uuid.UUID
    nombre: str
    documento: str
    telefono: str
    email: str | None
    notas: str | None
    activo: bool
    creado_en: datetime


class ClienteResumen(ClienteBase):
    placas: list[str]
    membresia: MembresiaResumen | None


class ClienteDetalle(ClienteBase):
    motos: list[Moto]
    membresia: MembresiaResumen | None


PaginaClientes = Pagina[ClienteResumen]


class ClienteCrear(Entrada):
    nombre: Texto = Field(min_length=2, max_length=120)
    documento: Documento
    telefono: Telefono
    email: EmailOpcional = None
    notas: TextoOpcional = Field(default=None, max_length=500)
    motos: list[MotoCrear] = Field(default_factory=list, max_length=5)


class ClienteEditar(Parche):
    NO_ANULABLES: ClassVar[frozenset[str]] = frozenset(
        {"nombre", "documento", "telefono", "activo"}
    )

    nombre: Texto | None = Field(default=None, min_length=2, max_length=120)
    documento: Documento | None = None
    telefono: Telefono | None = None
    email: EmailOpcional = None
    notas: TextoOpcional = Field(default=None, max_length=500)
    activo: bool | None = None
