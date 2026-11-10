"""Membresías: alta con pago inicial, cambio de plan y cancelación (RN-30 a RN-35, D-9)."""

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import Select, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.integridad import nombre_restriccion
from app.core.paginacion import ParamsPaginacion
from app.db.tipos import EstadoNotificacion
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.clientes.service import _filtro_busqueda
from app.modules.membresias.consultas import dias_por_vencer, filtro_estado
from app.modules.membresias.estado import EstadoMembresia, calcular_estado, dias_restantes
from app.modules.membresias.models import Membresia
from app.modules.membresias.schemas import Membresia as MembresiaSalida
from app.modules.membresias.schemas import MembresiaCambiarPlan, MembresiaCrear, MotivoEntrada
from app.modules.motos.models import Moto
from app.modules.motos.schemas import ClienteRef
from app.modules.notificaciones.models import Notificacion
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan
from app.modules.planes.schemas import PlanRef

MARGEN_FECHA_INICIO = 31  # días antes o después de hoy (RN-31)

MSG_EXISTENTE = "Este cliente ya tiene una membresía."
MSG_PLAN_INACTIVO = "Ese plan ya no está disponible."
MSG_CANCELADA = "Esta membresía está cancelada."
MSG_NOTA = "Explica por qué el monto es distinto al del plan."


def error_campo(campo: str, mensaje: str) -> ErrorApi:
    return ErrorApi("validacion", status=422, detalles=[{"campo": campo, "mensaje": mensaje}])


def plan_inactivo() -> ErrorApi:
    return ErrorApi("plan_inactivo", MSG_PLAN_INACTIVO, 409)


def membresia_cancelada() -> ErrorApi:
    return ErrorApi("membresia_cancelada", MSG_CANCELADA, 409)


def exigir_nota(monto: int, sugerido: int, nota: str | None, campo: str) -> None:
    """RN-43: si el monto difiere del propuesto, la nota es obligatoria."""
    if monto != sugerido and not nota:
        raise error_campo(campo, MSG_NOTA)


async def salidas(sesion: AsyncSession, membresias: Sequence[Membresia]) -> list[MembresiaSalida]:
    if not membresias:
        return []
    cliente_ids = {m.cliente_id for m in membresias}
    plan_ids = {m.plan_id for m in membresias}
    clientes = {
        c.id: c for c in await sesion.scalars(select(Cliente).where(Cliente.id.in_(cliente_ids)))
    }
    planes = {p.id: p for p in await sesion.scalars(select(Plan).where(Plan.id.in_(plan_ids)))}
    placas: dict[uuid.UUID, list[str]] = {i: [] for i in cliente_ids}
    filas = await sesion.execute(
        select(Moto.cliente_id, Moto.placa)
        .where(Moto.cliente_id.in_(cliente_ids), Moto.activo)
        .order_by(Moto.placa)
    )
    for cliente_id, placa in filas.all():
        placas[cliente_id].append(placa)
    hoy, dpv = reloj.hoy(), await dias_por_vencer(sesion)
    return [
        MembresiaSalida(
            id=m.id,
            cliente=ClienteRef.model_validate(clientes[m.cliente_id]),
            plan=PlanRef.model_validate(planes[m.plan_id]),
            placas=placas[m.cliente_id],
            fecha_inicio=m.fecha_inicio,
            fecha_vencimiento=m.fecha_vencimiento,
            estado=calcular_estado(m.fecha_vencimiento, m.cancelada_en, hoy, dpv),
            dias_restantes=dias_restantes(m.fecha_vencimiento, hoy),
            cancelada_en=m.cancelada_en,
            motivo_cancelacion=m.motivo_cancelacion,
            creado_en=m.creado_en,
        )
        for m in membresias
    ]


async def salida(sesion: AsyncSession, membresia: Membresia) -> MembresiaSalida:
    return (await salidas(sesion, [membresia]))[0]


async def bloquear(sesion: AsyncSession, membresia_id: uuid.UUID) -> Membresia:
    """Lee la membresía con `FOR UPDATE`: serializa todo cambio de `fecha_vencimiento`."""
    membresia = await sesion.scalar(
        select(Membresia)
        .where(Membresia.id == membresia_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if membresia is None:
        raise ErrorApi("no_encontrado", status=404)
    return membresia


async def cancelar_notificaciones_pendientes(sesion: AsyncSession, membresia_id: uuid.UUID) -> int:
    """RN-35 y RN-63: los avisos pendientes dejan de tener sentido."""
    resultado = await sesion.execute(
        update(Notificacion)
        .where(
            Notificacion.membresia_id == membresia_id,
            Notificacion.estado == EstadoNotificacion.PENDIENTE,
        )
        .values(estado=EstadoNotificacion.CANCELADA)
    )
    return int(getattr(resultado, "rowcount", 0) or 0)


async def listar(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    estado: EstadoMembresia | None,
    cliente_id: uuid.UUID | None,
    q: str | None,
) -> tuple[list[MembresiaSalida], int]:
    consulta: Select[Any] = select(Membresia)
    if estado is not None:
        consulta = consulta.where(filtro_estado(estado, reloj.hoy(), await dias_por_vencer(sesion)))
    elif cliente_id is None:
        consulta = consulta.where(Membresia.cancelada_en.is_(None))
    if cliente_id is not None:
        consulta = consulta.where(Membresia.cliente_id == cliente_id)
    if q:
        consulta = consulta.join(Cliente, Cliente.id == Membresia.cliente_id).where(
            _filtro_busqueda(q)
        )
    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    membresias = list(
        await sesion.scalars(
            consulta.order_by(Membresia.fecha_vencimiento, Membresia.id)
            .offset(pag.offset)
            .limit(pag.por_pagina)
        )
    )
    return await salidas(sesion, membresias), total


async def obtener(sesion: AsyncSession, membresia_id: uuid.UUID) -> MembresiaSalida:
    membresia = await sesion.get(Membresia, membresia_id)
    if membresia is None:
        raise ErrorApi("no_encontrado", status=404)
    return await salida(sesion, membresia)


async def crear(
    sesion: AsyncSession, datos: MembresiaCrear, usuario: Usuario, ip: str
) -> MembresiaSalida:
    cliente = await sesion.get(Cliente, datos.cliente_id)
    if cliente is None or not cliente.activo:
        raise ErrorApi("no_encontrado", status=404)
    plan = await sesion.get(Plan, datos.plan_id)
    if plan is None:
        raise ErrorApi("no_encontrado", status=404)
    if not plan.activo:
        raise plan_inactivo()

    hoy = reloj.hoy()
    inicio = datos.fecha_inicio or hoy
    if abs((inicio - hoy).days) > MARGEN_FECHA_INICIO:
        raise error_campo(
            "fecha_inicio",
            f"La fecha de inicio debe estar a menos de {MARGEN_FECHA_INICIO} días de hoy.",
        )
    pago_inicial = datos.pago_inicial
    exigir_nota(pago_inicial.monto, plan.precio, pago_inicial.nota, "pago_inicial.nota")

    existente = await sesion.scalar(
        select(Membresia.id).where(
            Membresia.cliente_id == cliente.id, Membresia.cancelada_en.is_(None)
        )
    )
    if existente is not None:
        raise ErrorApi("membresia_existente", MSG_EXISTENTE, 409)

    vencimiento = inicio + timedelta(days=plan.duracion_dias - 1)
    membresia = Membresia(
        cliente_id=cliente.id, plan_id=plan.id, fecha_inicio=inicio, fecha_vencimiento=vencimiento
    )
    sesion.add(membresia)
    try:
        await sesion.flush()
    except IntegrityError as exc:  # otra alta simultánea ganó (índice único parcial, RN-30)
        await sesion.rollback()
        if nombre_restriccion(exc) == "uq_membresias_cliente_no_cancelada":
            raise ErrorApi("membresia_existente", MSG_EXISTENTE, 409) from exc
        raise

    pago = Pago(
        membresia_id=membresia.id,
        plan_id=plan.id,
        monto=pago_inicial.monto,
        metodo=pago_inicial.metodo,
        periodos=1,
        periodo_desde=inicio,
        periodo_hasta=vencimiento,
        vencimiento_anterior=None,
        nota=pago_inicial.nota,
        registrado_por=usuario.id,
        creado_en=reloj.ahora(),
    )
    sesion.add(pago)
    await sesion.flush()

    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="membresia.crear",
        entidad="membresia",
        entidad_id=membresia.id,
        datos={
            "cliente_id": str(cliente.id),
            "plan_id": str(plan.id),
            "fecha_inicio": inicio.isoformat(),
            "fecha_vencimiento": vencimiento.isoformat(),
            "pago_id": str(pago.id),
            "monto": pago.monto,
        },
        ip=ip,
    )
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="pago.registrar",
        entidad="pago",
        entidad_id=pago.id,
        datos={
            "membresia_id": str(membresia.id),
            "plan_id": str(plan.id),
            "monto": pago.monto,
            "metodo": pago.metodo.value,
            "periodos": 1,
            "periodo_desde": inicio.isoformat(),
            "periodo_hasta": vencimiento.isoformat(),
            "vencimiento_anterior": None,
            "vencimiento_nuevo": vencimiento.isoformat(),
            "nota": pago.nota,
        },
        ip=ip,
    )
    await sesion.commit()
    await sesion.refresh(membresia)
    return await salida(sesion, membresia)


async def cambiar_plan(
    sesion: AsyncSession,
    membresia_id: uuid.UUID,
    datos: MembresiaCambiarPlan,
    usuario: Usuario,
    ip: str,
) -> MembresiaSalida:
    membresia = await bloquear(sesion, membresia_id)
    if membresia.cancelada_en is not None:
        raise membresia_cancelada()
    plan = await sesion.get(Plan, datos.plan_id)
    if plan is None:
        raise ErrorApi("no_encontrado", status=404)
    if not plan.activo:
        raise plan_inactivo()

    anterior = membresia.plan_id
    membresia.plan_id = plan.id  # RN-34: la fecha de vencimiento no cambia.
    await sesion.flush()
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="membresia.cambiar_plan",
        entidad="membresia",
        entidad_id=membresia.id,
        datos={
            "plan_anterior": str(anterior),
            "plan_nuevo": str(plan.id),
            "fecha_vencimiento": membresia.fecha_vencimiento.isoformat(),
        },
        ip=ip,
    )
    await sesion.commit()
    return await salida(sesion, membresia)


async def cancelar(
    sesion: AsyncSession,
    membresia_id: uuid.UUID,
    datos: MotivoEntrada,
    usuario: Usuario,
    ip: str,
) -> MembresiaSalida:
    membresia = await bloquear(sesion, membresia_id)
    if membresia.cancelada_en is not None:
        raise membresia_cancelada()
    membresia.cancelada_en = reloj.ahora()
    membresia.cancelada_por = usuario.id
    membresia.motivo_cancelacion = datos.motivo
    await sesion.flush()
    canceladas = await cancelar_notificaciones_pendientes(sesion, membresia.id)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="membresia.cancelar",
        entidad="membresia",
        entidad_id=membresia.id,
        datos={
            "motivo": datos.motivo,
            "fecha_vencimiento": membresia.fecha_vencimiento.isoformat(),
            "notificaciones_canceladas": canceladas,
        },
        ip=ip,
    )
    await sesion.commit()
    return await salida(sesion, membresia)
