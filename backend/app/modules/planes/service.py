"""Planes (RN-20 a RN-22). Escritura solo admin."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.integridad import UNICIDAD, error_duplicado, traducir
from app.modules.auth.models import Usuario
from app.modules.planes.models import Plan
from app.modules.planes.schemas import PlanCrear, PlanEditar
from app.modules.utilidades import diferencias


async def listar(sesion: AsyncSession, activo: bool | None) -> list[Plan]:
    consulta = select(Plan).order_by(Plan.duracion_dias.desc(), Plan.nombre)
    if activo is not None:
        consulta = consulta.where(Plan.activo.is_(activo))
    return list(await sesion.scalars(consulta))


async def _nombre_libre(sesion: AsyncSession, nombre: str, excepto: uuid.UUID | None) -> None:
    consulta = select(Plan.id).where(Plan.activo, func.lower(Plan.nombre) == nombre.lower())
    if excepto is not None:
        consulta = consulta.where(Plan.id != excepto)
    if await sesion.scalar(consulta) is not None:
        raise error_duplicado(*UNICIDAD["uq_planes_nombre_activo"])


async def _guardar(sesion: AsyncSession) -> None:
    try:
        await sesion.flush()
    except IntegrityError as exc:  # carrera con otra petición
        await sesion.rollback()
        raise traducir(exc) or exc from exc


async def crear(sesion: AsyncSession, datos: PlanCrear, usuario: Usuario, ip: str) -> Plan:
    await _nombre_libre(sesion, datos.nombre, None)
    plan = Plan(**datos.model_dump())
    sesion.add(plan)
    await _guardar(sesion)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="plan.crear",
        entidad="plan",
        entidad_id=plan.id,
        datos=datos.model_dump(),
        ip=ip,
    )
    await sesion.commit()
    await sesion.refresh(plan)
    return plan


async def editar(
    sesion: AsyncSession, plan_id: uuid.UUID, datos: PlanEditar, usuario: Usuario, ip: str
) -> Plan:
    plan = await sesion.get(Plan, plan_id, with_for_update=True)
    if plan is None:
        raise ErrorApi("no_encontrado", status=404)
    cambios: dict[str, Any] = datos.cambios()
    nombre = cambios.get("nombre", plan.nombre)
    queda_activo = cambios.get("activo", plan.activo)
    if queda_activo and ("nombre" in cambios or "activo" in cambios):
        await _nombre_libre(sesion, nombre, plan.id)

    detalle = diferencias(plan, cambios)
    for campo, valor in cambios.items():
        setattr(plan, campo, valor)
    await _guardar(sesion)
    accion = "plan.editar"
    if "activo" in detalle:
        accion = "plan.activar" if plan.activo else "plan.desactivar"
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion=accion,
        entidad="plan",
        entidad_id=plan.id,
        datos={"cambios": detalle},
        ip=ip,
    )
    await sesion.commit()
    await sesion.refresh(plan)
    return plan
