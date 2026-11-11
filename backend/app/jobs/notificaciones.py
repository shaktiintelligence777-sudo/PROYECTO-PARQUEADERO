"""Job diario de notificaciones (B-07, RN-60 a RN-64). Lo invoca `POST /internal/jobs/...`.

1. Genera las notificaciones de hoy con `INSERT … ON CONFLICT DO NOTHING` (RN-61).
2. Envía las de hoy `pendiente` y las `fallida` con menos de 3 intentos (RN-62, RN-64).
   Cada envío se confirma en su propia transacción.
3. Registra la ejecución en `auditoria`.
"""

import logging
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.correo import ErrorCorreo, ProveedorCorreo, enmascarar
from app.db.tipos import CanalNotificacion, EstadoNotificacion, TipoNotificacion
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.models import Membresia
from app.modules.notificaciones import plantillas
from app.modules.notificaciones.models import Notificacion
from app.modules.notificaciones.schemas import ResultadoJob
from app.modules.planes.models import Plan

log = logging.getLogger("app.jobs.notificaciones")

MAX_INTENTOS = 3
CANAL = CanalNotificacion.EMAIL  # D-3: solo email en el MVP.


def tipo_para(
    fecha_vencimiento: date, hoy: date, dias_recordatorio: list[int]
) -> TipoNotificacion | None:
    """RN-60: recordatorio si faltan N días (N en `dias_recordatorio`); `vencida` el día
    siguiente al vencimiento; nada en otro caso."""
    if (fecha_vencimiento - hoy).days in dias_recordatorio:
        return TipoNotificacion.RECORDATORIO
    if hoy == fecha_vencimiento + timedelta(days=1):
        return TipoNotificacion.VENCIDA
    return None


def _destinatario_valido() -> ColumnElement[bool]:
    return and_(
        Membresia.cancelada_en.is_(None),
        Cliente.activo.is_(True),
        Cliente.email.is_not(None),
        Cliente.email != "",
    )


async def _generar(sesion: AsyncSession, hoy: date, config: Configuracion) -> set[uuid.UUID]:
    fechas = {hoy + timedelta(days=d) for d in config.dias_recordatorio} | {hoy - timedelta(1)}
    filas = await sesion.execute(
        select(Membresia.id, Membresia.fecha_vencimiento)
        .join(Cliente, Cliente.id == Membresia.cliente_id)
        .where(_destinatario_valido(), Membresia.fecha_vencimiento.in_(fechas))
    )
    nuevas: list[dict[str, Any]] = []
    for membresia_id, vence in filas.all():
        tipo = tipo_para(vence, hoy, list(config.dias_recordatorio))
        if tipo is not None:
            nuevas.append(
                {
                    "id": uuid.uuid4(),
                    "membresia_id": membresia_id,
                    "tipo": tipo,
                    "canal": CANAL,
                    "programada_para": hoy,
                }
            )
    if not nuevas:
        return set()
    creadas = await sesion.scalars(
        insert(Notificacion)
        .values(nuevas)
        .on_conflict_do_nothing(constraint="uq_notificaciones_aviso")
        .returning(Notificacion.id)
    )
    ids = set(creadas)
    await sesion.commit()
    return ids


def _enviable(hoy: date) -> ColumnElement[bool]:
    """RN-62 y RN-64: solo las de hoy, pendientes o fallidas con intentos disponibles."""
    return and_(
        Notificacion.programada_para == hoy,
        Notificacion.canal == CANAL,
        or_(
            Notificacion.estado == EstadoNotificacion.PENDIENTE,
            and_(
                Notificacion.estado == EstadoNotificacion.FALLIDA,
                Notificacion.intentos < MAX_INTENTOS,
            ),
        ),
    )


def _plantillas(config: Configuracion, tipo: TipoNotificacion) -> tuple[str, str]:
    if tipo == TipoNotificacion.RECORDATORIO:
        return config.plantilla_recordatorio_asunto, config.plantilla_recordatorio_cuerpo
    return config.plantilla_vencida_asunto, config.plantilla_vencida_cuerpo


async def _enviar_una(
    sesion: AsyncSession,
    proveedor: ProveedorCorreo,
    notificacion_id: uuid.UUID,
    hoy: date,
    config: Configuracion,
) -> EstadoNotificacion | None:
    """Envía una notificación con su fila bloqueada y confirma. None si no correspondía."""
    fila = (
        await sesion.execute(
            select(Notificacion, Membresia, Cliente, Plan)
            .join(Membresia, Membresia.id == Notificacion.membresia_id)
            .join(Cliente, Cliente.id == Membresia.cliente_id)
            .join(Plan, Plan.id == Membresia.plan_id)
            .where(Notificacion.id == notificacion_id, _enviable(hoy), _destinatario_valido())
            .with_for_update(of=Notificacion, skip_locked=True)
            .execution_options(populate_existing=True)
        )
    ).first()
    if fila is None:  # otra ejecución la tomó, o el cliente ya no es destinatario válido
        await sesion.commit()
        return None
    notificacion, membresia, cliente, plan = fila
    asunto_t, cuerpo_t = _plantillas(config, notificacion.tipo)
    valores = plantillas.valores(
        nombre=cliente.nombre,
        plan=plan.nombre,
        fecha_vencimiento=membresia.fecha_vencimiento,
        precio=plan.precio,
        parqueadero=config.nombre_parqueadero,
    )
    try:
        await proveedor.enviar(
            cliente.email or "",
            plantillas.renderizar(asunto_t, valores),
            plantillas.renderizar(cuerpo_t, valores),
        )
    except Exception as exc:  # el fallo de una no detiene las demás
        error = str(exc) if isinstance(exc, ErrorCorreo) else f"Error inesperado: {exc}"
        notificacion.estado = EstadoNotificacion.FALLIDA
        notificacion.intentos += 1
        notificacion.error = enmascarar(error)[:300]
        log.warning(
            "Aviso %s a %s falló (intento %s): %s",
            notificacion.tipo.value,
            enmascarar(cliente.email or ""),
            notificacion.intentos,
            notificacion.error,
        )
    else:
        notificacion.estado = EstadoNotificacion.ENVIADA
        notificacion.enviada_en = reloj.ahora()
        notificacion.error = None
        log.info("Aviso %s enviado a %s", notificacion.tipo.value, enmascarar(cliente.email or ""))
    estado = notificacion.estado
    await sesion.commit()
    return estado


async def ejecutar(sesion: AsyncSession, proveedor: ProveedorCorreo) -> ResultadoJob:
    hoy = reloj.hoy()
    config = await sesion.get(Configuracion, 1)
    if config is None:
        raise RuntimeError("Falta la fila de configuración (id = 1)")
    creadas = await _generar(sesion, hoy, config)

    pendientes = list(
        await sesion.scalars(
            select(Notificacion.id).where(_enviable(hoy)).order_by(Notificacion.creado_en)
        )
    )
    total_hoy = (
        await sesion.scalar(
            select(func.count())
            .select_from(Notificacion)
            .where(Notificacion.programada_para == hoy, Notificacion.canal == CANAL)
        )
        or 0
    )
    enviadas = fallidas = previas_intentadas = 0
    for notificacion_id in pendientes:
        estado = await _enviar_una(sesion, proveedor, notificacion_id, hoy, config)
        if estado is not None and notificacion_id not in creadas:
            previas_intentadas += 1
        if estado == EstadoNotificacion.ENVIADA:
            enviadas += 1
        elif estado == EstadoNotificacion.FALLIDA:
            fallidas += 1
    # Omitidas: ya existían de una ejecución anterior de hoy y esta vez no se intentaron.
    omitidas = total_hoy - len(creadas) - previas_intentadas
    resultado = ResultadoJob(
        fecha=hoy,
        creadas=len(creadas),
        enviadas=enviadas,
        fallidas=fallidas,
        omitidas=max(omitidas, 0),
    )
    await registrar_auditoria(
        sesion,
        usuario_id=None,
        accion="notificaciones.job",
        entidad="notificaciones",
        datos=resultado.model_dump(mode="json"),
    )
    await sesion.commit()
    log.info("Job de notificaciones %s", resultado.model_dump(mode="json"))
    return resultado
