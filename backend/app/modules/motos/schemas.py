import uuid
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from app.core.esquemas import Entrada, Parche, PlacaEntrada, TextoOpcional


class ClienteRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    documento: str
    telefono: str


class Moto(BaseModel):
    id: uuid.UUID
    cliente_id: uuid.UUID
    placa: str
    marca: str | None
    color: str | None
    activo: bool
    dentro: bool
    creado_en: datetime


class MotoConCliente(Moto):
    cliente: ClienteRef


class MotoCrear(Entrada):
    placa: PlacaEntrada
    marca: TextoOpcional = Field(default=None, max_length=40)
    color: TextoOpcional = Field(default=None, max_length=30)


class MotoCrearConCliente(MotoCrear):
    cliente_id: uuid.UUID


class MotoEditar(Parche):
    NO_ANULABLES: ClassVar[frozenset[str]] = frozenset({"placa", "activo", "cliente_id"})

    placa: PlacaEntrada | None = None
    marca: TextoOpcional = Field(default=None, max_length=40)
    color: TextoOpcional = Field(default=None, max_length=30)
    activo: bool | None = None
    cliente_id: uuid.UUID | None = None
