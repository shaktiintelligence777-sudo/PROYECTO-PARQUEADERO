"""Consulta de notificaciones (B-07). La generación y el envío están en `app/jobs/`."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.correo import ProveedorCorreo
from app.core.paginacion import ParamsPaginacion
from app.db.tipos import EstadoNotificacion
from app.jobs import notificaciones as job
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import Membresia
from app.modules.motos.schemas import ClienteRef
from app.modules.notificaciones.models import Notificacion
from app.modules.notificaciones.schemas import Notificacion as NotificacionSalida
from app.modules.notificaciones.schemas import ResultadoJob


async def ejecutar_job(sesion: AsyncSession, proveedor: ProveedorCorreo) -> ResultadoJob:
    return await job.ejecutar(sesion, proveedor)


async def listar(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    estado: EstadoNotificacion | None,
    membresia_id: uuid.UUID | None,
    desde: date | None,
    hasta: date | None,
) -> tuple[list[NotificacionSalida], int]:
    consulta: Select[Any] = select(Notificacion)
    if estado is not None:
        consulta = consulta.where(Notificacion.estado == estado)
    if membresia_id is not None:
        consulta = consulta.where(Notificacion.membresia_id == membresia_id)
    if desde is not None:
        consulta = consulta.where(Notificacion.programada_para >= desde)
    if hasta is not None:
        consulta = consulta.where(Notificacion.programada_para <= hasta)
    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    notificaciones = list(
        await sesion.scalars(
            consulta.order_by(
                Notificacion.programada_para.desc(),
                Notificacion.creado_en.desc(),
                Notificacion.id,
            )
            .offset(pag.offset)
            .limit(pag.por_pagina)
        )
    )
    clientes: dict[uuid.UUID, Cliente] = {}
    if notificaciones:
        filas = await sesion.execute(
            select(Membresia.id, Cliente)
            .join(Cliente, Cliente.id == Membresia.cliente_id)
            .where(Membresia.id.in_({n.membresia_id for n in notificaciones}))
        )
        clientes = {membresia_id: cliente for membresia_id, cliente in filas.all()}
    items = [
        NotificacionSalida(
            id=n.id,
            membresia_id=n.membresia_id,
            cliente=ClienteRef.model_validate(clientes[n.membresia_id]),
            tipo=n.tipo,
            canal=n.canal,
            programada_para=n.programada_para,
            estado=n.estado,
            enviada_en=n.enviada_en,
            intentos=n.intentos,
            error=n.error,
            creado_en=n.creado_en,
        )
        for n in notificaciones
    ]
    return items, total
