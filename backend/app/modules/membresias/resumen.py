"""`MembresiaResumen`: vista corta embebida en clientes y accesos."""

import uuid
from collections.abc import Iterable
from datetime import date

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.modules.membresias.consultas import dias_por_vencer, no_canceladas_por_cliente
from app.modules.membresias.estado import EstadoMembresia, calcular_estado, dias_restantes
from app.modules.membresias.models import Membresia
from app.modules.planes.models import Plan
from app.modules.planes.schemas import PlanRef


class MembresiaResumen(BaseModel):
    id: uuid.UUID
    plan: PlanRef
    fecha_vencimiento: date
    estado: EstadoMembresia
    dias_restantes: int


def resumir(membresia: Membresia, plan: Plan, hoy: date, dpv: int) -> MembresiaResumen:
    return MembresiaResumen(
        id=membresia.id,
        plan=PlanRef.model_validate(plan),
        fecha_vencimiento=membresia.fecha_vencimiento,
        estado=calcular_estado(membresia.fecha_vencimiento, membresia.cancelada_en, hoy, dpv),
        dias_restantes=dias_restantes(membresia.fecha_vencimiento, hoy),
    )


async def resumenes_por_cliente(
    sesion: AsyncSession, cliente_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, MembresiaResumen]:
    """Membresía no cancelada de cada cliente, resumida. Clientes sin ella no aparecen."""
    membresias = await no_canceladas_por_cliente(sesion, cliente_ids)
    if not membresias:
        return {}
    plan_ids = {m.plan_id for m in membresias.values()}
    planes = {p.id: p for p in await sesion.scalars(select(Plan).where(Plan.id.in_(plan_ids)))}
    hoy, dpv = reloj.hoy(), await dias_por_vencer(sesion)
    return {c: resumir(m, planes[m.plan_id], hoy, dpv) for c, m in membresias.items()}
