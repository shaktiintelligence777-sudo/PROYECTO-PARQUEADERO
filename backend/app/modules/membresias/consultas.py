"""Consultas de lectura sobre membresías que comparten varios módulos."""

import uuid
from collections.abc import Iterable
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.configuracion.models import Configuracion
from app.modules.membresias.estado import EstadoMembresia
from app.modules.membresias.models import Membresia


async def dias_por_vencer(sesion: AsyncSession) -> int:
    valor = await sesion.scalar(select(Configuracion.dias_por_vencer).where(Configuracion.id == 1))
    return valor if valor is not None else 3


def filtro_estado(estado: EstadoMembresia, hoy: date, dpv: int) -> ColumnElement[bool]:
    """Condición SQL equivalente a `calcular_estado` (RN-32), para filtrar en la base."""
    limite = hoy + timedelta(days=dpv)
    vigente = Membresia.cancelada_en.is_(None)
    match estado:
        case EstadoMembresia.CANCELADA:
            return Membresia.cancelada_en.is_not(None)
        case EstadoMembresia.VENCIDA:
            return and_(vigente, Membresia.fecha_vencimiento < hoy)
        case EstadoMembresia.POR_VENCER:
            return and_(
                vigente, Membresia.fecha_vencimiento >= hoy, Membresia.fecha_vencimiento <= limite
            )
        case EstadoMembresia.ACTIVA:
            return and_(vigente, Membresia.fecha_vencimiento > limite)


def existe_no_cancelada(cliente_id: Any) -> ColumnElement[bool]:
    return exists().where(Membresia.cliente_id == cliente_id, Membresia.cancelada_en.is_(None))


async def no_canceladas_por_cliente(
    sesion: AsyncSession, cliente_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, Membresia]:
    ids = list(cliente_ids)
    if not ids:
        return {}
    filas = await sesion.scalars(
        select(Membresia).where(Membresia.cliente_id.in_(ids), Membresia.cancelada_en.is_(None))
    )
    return {m.cliente_id: m for m in filas}
