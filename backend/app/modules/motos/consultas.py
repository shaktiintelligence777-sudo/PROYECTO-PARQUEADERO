"""Lecturas sobre motos que comparten clientes y motos."""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accesos.models import Estancia
from app.modules.motos.models import Moto
from app.modules.motos.schemas import Moto as MotoSalida


async def ids_dentro(sesion: AsyncSession, moto_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    """Motos con una estancia abierta (RN-50)."""
    ids = list(moto_ids)
    if not ids:
        return set()
    filas = await sesion.scalars(
        select(Estancia.moto_id).where(Estancia.moto_id.in_(ids), Estancia.salida_en.is_(None))
    )
    return set(filas)


def a_salida(moto: Moto, dentro: set[uuid.UUID]) -> MotoSalida:
    return MotoSalida(
        id=moto.id,
        cliente_id=moto.cliente_id,
        placa=moto.placa,
        marca=moto.marca,
        color=moto.color,
        activo=moto.activo,
        dentro=moto.id in dentro,
        creado_en=moto.creado_en,
    )
