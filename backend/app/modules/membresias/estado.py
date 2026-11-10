"""Estado calculado de una membresía (D-8, RN-32, RN-33, RN-52). Funciones puras.

El estado no se guarda: se deriva de `fecha_vencimiento`, `cancelada_en`, “hoy” y
`dias_por_vencer` (configuración). Lo usan B-04, B-05, B-06 y B-08.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Protocol


class EstadoMembresia(StrEnum):
    ACTIVA = "activa"
    POR_VENCER = "por_vencer"
    VENCIDA = "vencida"
    CANCELADA = "cancelada"


class Advertencia(StrEnum):
    SIN_MEMBRESIA = "sin_membresia"
    MEMBRESIA_VENCIDA = "membresia_vencida"
    MEMBRESIA_POR_VENCER = "membresia_por_vencer"


class ConFechas(Protocol):
    @property
    def fecha_vencimiento(self) -> date: ...
    @property
    def cancelada_en(self) -> datetime | None: ...


def calcular_estado(
    fecha_vencimiento: date, cancelada_en: datetime | None, hoy: date, dias_por_vencer: int
) -> EstadoMembresia:
    """RN-32, evaluado en orden. El día del vencimiento todavía es `por_vencer`."""
    if cancelada_en is not None:
        return EstadoMembresia.CANCELADA
    if hoy > fecha_vencimiento:
        return EstadoMembresia.VENCIDA
    if (fecha_vencimiento - hoy).days <= dias_por_vencer:
        return EstadoMembresia.POR_VENCER
    return EstadoMembresia.ACTIVA


def dias_restantes(fecha_vencimiento: date, hoy: date) -> int:
    """RN-33: negativo si está vencida."""
    return (fecha_vencimiento - hoy).days


def advertencias_de(
    membresia: ConFechas | None, hoy: date, dias_por_vencer: int
) -> list[Advertencia]:
    """RN-52: avisos al registrar una entrada. Nunca bloquean."""
    if membresia is None:
        return [Advertencia.SIN_MEMBRESIA]
    estado = calcular_estado(
        membresia.fecha_vencimiento, membresia.cancelada_en, hoy, dias_por_vencer
    )
    match estado:
        case EstadoMembresia.CANCELADA:
            return [Advertencia.SIN_MEMBRESIA]
        case EstadoMembresia.VENCIDA:
            return [Advertencia.MEMBRESIA_VENCIDA]
        case EstadoMembresia.POR_VENCER:
            return [Advertencia.MEMBRESIA_POR_VENCER]
    return []
