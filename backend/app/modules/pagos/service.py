"""Pagos: registro, vista previa, anulación y listados (RN-40 a RN-47, RN-63, D-10)."""

import uuid
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.paginacion import ParamsPaginacion
from app.db.tipos import MetodoPago
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.membresias import service as membresias
from app.modules.membresias.models import Membresia
from app.modules.membresias.schemas import MotivoEntrada
from app.modules.motos.schemas import ClienteRef
from app.modules.pagos.models import Pago
from app.modules.pagos.periodos import calcular_periodo
from app.modules.pagos.schemas import Pago as PagoSalida
from app.modules.pagos.schemas import (
    PagoCrear,
    PagoPrevisualizar,
    PagoRegistrado,
    PagoVistaPrevia,
    UsuarioRef,
)
from app.modules.planes.models import Plan
from app.modules.planes.schemas import PlanRef

MSG_NO_ANULABLE = "Solo se puede anular el último pago de una membresía."


def _no_anulable() -> ErrorApi:
    return ErrorApi("pago_no_anulable", MSG_NO_ANULABLE, 409)


async def salidas(sesion: AsyncSession, pagos: Sequence[Pago]) -> list[PagoSalida]:
    if not pagos:
        return []
    membresia_ids = {p.membresia_id for p in pagos}
    cliente_de = dict(
        (
            await sesion.execute(
                select(Membresia.id, Membresia.cliente_id).where(Membresia.id.in_(membresia_ids))
            )
        ).all()
    )
    clientes = {
        c.id: c
        for c in await sesion.scalars(
            select(Cliente).where(Cliente.id.in_(set(cliente_de.values())))
        )
    }
    planes = {
        p.id: p
        for p in await sesion.scalars(select(Plan).where(Plan.id.in_({p.plan_id for p in pagos})))
    }
    usuario_ids = {p.registrado_por for p in pagos} | {
        p.anulado_por for p in pagos if p.anulado_por is not None
    }
    filas = await sesion.execute(
        select(Usuario.id, Usuario.nombre).where(Usuario.id.in_(usuario_ids))
    )
    usuarios = dict(filas.all())

    def ref(usuario_id: uuid.UUID) -> UsuarioRef:
        return UsuarioRef(id=usuario_id, nombre=usuarios[usuario_id])

    return [
        PagoSalida(
            id=p.id,
            membresia_id=p.membresia_id,
            cliente=ClienteRef.model_validate(clientes[cliente_de[p.membresia_id]]),
            # El plan guardado en el pago, no el actual de la membresía.
            plan=PlanRef.model_validate(planes[p.plan_id]),
            monto=p.monto,
            metodo=p.metodo,
            periodos=p.periodos,
            periodo_desde=p.periodo_desde,
            periodo_hasta=p.periodo_hasta,
            nota=p.nota,
            registrado_por=ref(p.registrado_por),
            creado_en=p.creado_en,
            anulado=p.anulado_en is not None,
            anulado_en=p.anulado_en,
            anulado_por=ref(p.anulado_por) if p.anulado_por is not None else None,
            motivo_anulacion=p.motivo_anulacion,
        )
        for p in pagos
    ]


async def _plan_pagable(sesion: AsyncSession, membresia: Membresia) -> Plan:
    """Valida que se pueda pagar: membresía no cancelada (RN-40) y plan activo (CB-13)."""
    if membresia.cancelada_en is not None:
        raise membresias.membresia_cancelada()
    plan = await sesion.get(Plan, membresia.plan_id)
    if plan is None or not plan.activo:
        raise membresias.plan_inactivo()
    return plan


async def previsualizar(sesion: AsyncSession, datos: PagoPrevisualizar) -> PagoVistaPrevia:
    """RN-44: el mismo cálculo que `registrar`, sin escribir ni auditar."""
    membresia = await sesion.get(Membresia, datos.membresia_id)
    if membresia is None:
        raise ErrorApi("no_encontrado", status=404)
    plan = await _plan_pagable(sesion, membresia)
    desde, hasta = calcular_periodo(
        membresia.fecha_vencimiento, reloj.hoy(), plan.duracion_dias, datos.periodos
    )
    return PagoVistaPrevia(
        membresia_id=membresia.id,
        plan=PlanRef.model_validate(plan),
        periodos=datos.periodos,
        monto_sugerido=plan.precio * datos.periodos,
        periodo_desde=desde,
        periodo_hasta=hasta,
        vencimiento_actual=membresia.fecha_vencimiento,
        vencimiento_nuevo=hasta,
    )


async def _extender(sesion: AsyncSession, membresia: Membresia, hasta: date) -> None:
    """RN-42: tras el pago, el vencimiento pasa a `periodo_hasta`."""
    membresia.fecha_vencimiento = hasta
    await sesion.flush()


async def registrar(
    sesion: AsyncSession, datos: PagoCrear, usuario: Usuario, ip: str
) -> PagoRegistrado:
    membresia = await membresias.bloquear(sesion, datos.membresia_id)
    plan = await _plan_pagable(sesion, membresia)
    membresias.exigir_nota(datos.monto, plan.precio * datos.periodos, datos.nota, "nota")

    anterior = membresia.fecha_vencimiento
    desde, hasta = calcular_periodo(anterior, reloj.hoy(), plan.duracion_dias, datos.periodos)
    pago = Pago(
        membresia_id=membresia.id,
        plan_id=plan.id,
        monto=datos.monto,
        metodo=datos.metodo,
        periodos=datos.periodos,
        periodo_desde=desde,
        periodo_hasta=hasta,
        vencimiento_anterior=anterior,
        nota=datos.nota,
        registrado_por=usuario.id,
        creado_en=reloj.ahora(),
    )
    sesion.add(pago)
    await sesion.flush()
    await _extender(sesion, membresia, hasta)
    canceladas = await membresias.cancelar_notificaciones_pendientes(sesion, membresia.id)

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
            "periodos": pago.periodos,
            "periodo_desde": desde.isoformat(),
            "periodo_hasta": hasta.isoformat(),
            "vencimiento_anterior": anterior.isoformat(),
            "vencimiento_nuevo": hasta.isoformat(),
            "nota": pago.nota,
            "notificaciones_canceladas": canceladas,
        },
        ip=ip,
    )
    await sesion.commit()
    return PagoRegistrado(
        pago=(await salidas(sesion, [pago]))[0],
        membresia=await membresias.salida(sesion, membresia),
    )


async def anular(
    sesion: AsyncSession, pago_id: uuid.UUID, datos: MotivoEntrada, usuario: Usuario, ip: str
) -> PagoRegistrado:
    membresia_id = await sesion.scalar(select(Pago.membresia_id).where(Pago.id == pago_id))
    if membresia_id is None:
        raise ErrorApi("no_encontrado", status=404)
    # Primero la membresía (mismo orden de bloqueo que `registrar`), luego el pago.
    membresia = await membresias.bloquear(sesion, membresia_id)
    pago = await sesion.scalar(
        select(Pago)
        .where(Pago.id == pago_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if pago is None:
        raise ErrorApi("no_encontrado", status=404)
    ultimo = await sesion.scalar(
        select(Pago.id)
        .where(Pago.membresia_id == membresia.id, Pago.anulado_en.is_(None))
        .order_by(Pago.creado_en.desc(), Pago.periodo_hasta.desc())
        .limit(1)
    )
    if (
        pago.anulado_en is not None
        or pago.vencimiento_anterior is None
        or membresia.cancelada_en is not None
        or ultimo != pago.id
    ):
        raise _no_anulable()

    vencimiento_previo = membresia.fecha_vencimiento
    pago.anulado_en = reloj.ahora()
    pago.anulado_por = usuario.id
    pago.motivo_anulacion = datos.motivo
    membresia.fecha_vencimiento = pago.vencimiento_anterior
    await sesion.flush()
    canceladas = await membresias.cancelar_notificaciones_pendientes(sesion, membresia.id)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="pago.anular",
        entidad="pago",
        entidad_id=pago.id,
        datos={
            "membresia_id": str(membresia.id),
            "monto": pago.monto,
            "motivo": datos.motivo,
            "vencimiento_anterior": vencimiento_previo.isoformat(),
            "vencimiento_nuevo": membresia.fecha_vencimiento.isoformat(),
            "notificaciones_canceladas": canceladas,
        },
        ip=ip,
    )
    await sesion.commit()
    return PagoRegistrado(
        pago=(await salidas(sesion, [pago]))[0],
        membresia=await membresias.salida(sesion, membresia),
    )


def _inicio_dia(dia: date) -> datetime:
    return datetime.combine(dia, time.min, tzinfo=reloj.zona())


async def _pagina(
    sesion: AsyncSession, consulta: Select[Any], pag: ParamsPaginacion
) -> tuple[list[PagoSalida], int]:
    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    pagos = list(
        await sesion.scalars(
            consulta.order_by(Pago.creado_en.desc(), Pago.periodo_hasta.desc(), Pago.id)
            .offset(pag.offset)
            .limit(pag.por_pagina)
        )
    )
    return await salidas(sesion, pagos), total


async def listar(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    desde: date | None,
    hasta: date | None,
    cliente_id: uuid.UUID | None,
    metodo: MetodoPago | None,
    incluir_anulados: bool,
) -> tuple[list[PagoSalida], int]:
    consulta: Select[Any] = select(Pago)
    # `desde`/`hasta` son días de America/Bogota sobre `creado_en` (inclusive).
    if desde is not None:
        consulta = consulta.where(Pago.creado_en >= _inicio_dia(desde))
    if hasta is not None:
        consulta = consulta.where(Pago.creado_en < _inicio_dia(hasta + timedelta(days=1)))
    if cliente_id is not None:
        consulta = consulta.join(Membresia, Membresia.id == Pago.membresia_id).where(
            Membresia.cliente_id == cliente_id
        )
    if metodo is not None:
        consulta = consulta.where(Pago.metodo == metodo)
    if not incluir_anulados:
        consulta = consulta.where(Pago.anulado_en.is_(None))
    return await _pagina(sesion, consulta, pag)


async def listar_de_membresia(
    sesion: AsyncSession, membresia_id: uuid.UUID, pag: ParamsPaginacion
) -> tuple[list[PagoSalida], int]:
    if await sesion.get(Membresia, membresia_id) is None:
        raise ErrorApi("no_encontrado", status=404)
    return await _pagina(sesion, select(Pago).where(Pago.membresia_id == membresia_id), pag)
