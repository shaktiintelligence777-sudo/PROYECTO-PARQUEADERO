"""Esquemas de accesos: replican `contracts/openapi.yaml` (Estancia, ConsultaPlaca, ...)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.esquemas import Entrada, PlacaEntrada
from app.core.paginacion import Pagina
from app.modules.membresias.estado import Advertencia
from app.modules.membresias.resumen import MembresiaResumen
from app.modules.motos.schemas import ClienteRef
from app.modules.motos.schemas import Moto as MotoSalida


class AccesoEntrada(Entrada):
    placa: PlacaEntrada


class UsuarioRef(BaseModel):
    id: uuid.UUID
    nombre: str


class MotoEstancia(BaseModel):
    id: uuid.UUID
    placa: str
    marca: str | None
    color: str | None


class Estancia(BaseModel):
    id: uuid.UUID
    moto: MotoEstancia
    cliente: ClienteRef
    entrada_en: datetime
    salida_en: datetime | None
    duracion_minutos: int
    operador_entrada: UsuarioRef
    operador_salida: UsuarioRef | None


class ConsultaPlaca(BaseModel):
    moto: MotoSalida
    cliente: ClienteRef
    membresia: MembresiaResumen | None
    estancia_abierta: Estancia | None
    advertencias: list[Advertencia]


class AccesoRegistrado(BaseModel):
    estancia: Estancia
    membresia: MembresiaResumen | None
    advertencias: list[Advertencia]


class MotosDentro(BaseModel):
    items: list[Estancia]
    total: int
    capacidad: int | None


PaginaEstancias = Pagina[Estancia]
