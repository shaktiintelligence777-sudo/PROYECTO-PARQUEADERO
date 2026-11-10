"""Clientes (RN-04 a RN-06, RN-10 a RN-14, D-12)."""

import re
import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, exists, func, not_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.integridad import UNICIDAD, error_duplicado, traducir
from app.core.paginacion import ParamsPaginacion
from app.db.tipos import Rol
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.busqueda import escapar_like, solo_alfanumerico
from app.modules.clientes.models import Cliente
from app.modules.clientes.schemas import ClienteCrear, ClienteDetalle, ClienteEditar, ClienteResumen
from app.modules.membresias.consultas import dias_por_vencer, existe_no_cancelada, filtro_estado
from app.modules.membresias.estado import EstadoMembresia
from app.modules.membresias.models import Membresia
from app.modules.membresias.resumen import resumenes_por_cliente
from app.modules.motos.consultas import a_salida, ids_dentro
from app.modules.motos.models import Moto
from app.modules.utilidades import a_json, diferencias

ESTADOS_FILTRO = ("activa", "por_vencer", "vencida", "sin_membresia")


def _filtro_busqueda(q: str) -> Any:
    texto = q.strip()
    condiciones: list[ColumnElement[bool]] = [
        func.lower(func.f_unaccent(Cliente.nombre)).like(
            func.concat("%", func.lower(func.f_unaccent(escapar_like(texto))), "%"),
            escape="\\",
        )
    ]
    documento = re.sub(r"[\s.]", "", texto).upper()
    if documento:
        condiciones.append(Cliente.documento.startswith(documento, autoescape=True))
    placa = solo_alfanumerico(texto)
    if placa:
        condiciones.append(
            exists().where(
                Moto.cliente_id == Cliente.id,
                Moto.activo,
                Moto.placa.startswith(placa, autoescape=True),
            )
        )
    return or_(*condiciones)


async def listar(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    q: str | None,
    estado_membresia: str | None,
    activo: bool,
) -> tuple[list[ClienteResumen], int]:
    consulta: Select[Any] = select(Cliente).where(Cliente.activo.is_(activo))
    if q:
        consulta = consulta.where(_filtro_busqueda(q))
    if estado_membresia == "sin_membresia":
        consulta = consulta.where(not_(existe_no_cancelada(Cliente.id)))
    elif estado_membresia:
        filtro = filtro_estado(
            EstadoMembresia(estado_membresia), reloj.hoy(), await dias_por_vencer(sesion)
        )
        consulta = consulta.where(exists().where(and_(Membresia.cliente_id == Cliente.id, filtro)))

    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    clientes = list(
        await sesion.scalars(
            consulta.order_by(Cliente.nombre, Cliente.id).offset(pag.offset).limit(pag.por_pagina)
        )
    )
    ids = [c.id for c in clientes]
    membresias = await resumenes_por_cliente(sesion, ids)
    placas: dict[uuid.UUID, list[str]] = {i: [] for i in ids}
    if ids:
        filas = await sesion.execute(
            select(Moto.cliente_id, Moto.placa)
            .where(Moto.cliente_id.in_(ids), Moto.activo)
            .order_by(Moto.placa)
        )
        for cliente_id, placa in filas.all():
            placas[cliente_id].append(placa)
    items = [
        ClienteResumen(**_base(c), placas=placas[c.id], membresia=membresias.get(c.id))
        for c in clientes
    ]
    return items, total


def _base(c: Cliente) -> dict[str, Any]:
    return {
        "id": c.id,
        "nombre": c.nombre,
        "documento": c.documento,
        "telefono": c.telefono,
        "email": c.email,
        "notas": c.notas,
        "activo": c.activo,
        "creado_en": c.creado_en,
    }


async def detalle(sesion: AsyncSession, cliente: Cliente) -> ClienteDetalle:
    motos = list(
        await sesion.scalars(
            select(Moto)
            .where(Moto.cliente_id == cliente.id)
            .order_by(Moto.activo.desc(), Moto.placa)
        )
    )
    dentro = await ids_dentro(sesion, (m.id for m in motos))
    membresia = (await resumenes_por_cliente(sesion, [cliente.id])).get(cliente.id)
    return ClienteDetalle(
        **_base(cliente), motos=[a_salida(m, dentro) for m in motos], membresia=membresia
    )


async def obtener(sesion: AsyncSession, cliente_id: uuid.UUID) -> ClienteDetalle:
    cliente = await sesion.get(Cliente, cliente_id)
    if cliente is None:
        raise ErrorApi("no_encontrado", status=404)
    return await detalle(sesion, cliente)


async def _documento_libre(
    sesion: AsyncSession, documento: str, excepto: uuid.UUID | None = None
) -> None:
    consulta = select(Cliente.id).where(Cliente.documento == documento)
    if excepto is not None:
        consulta = consulta.where(Cliente.id != excepto)
    if await sesion.scalar(consulta) is not None:
        raise error_duplicado(*UNICIDAD["uq_clientes_documento"])


def _placa_duplicada(campo: str) -> ErrorApi:
    codigo, _, mensaje = UNICIDAD["uq_motos_placa"]
    return error_duplicado(codigo, campo, mensaje)


async def _flush(sesion: AsyncSession, campo: str | None = None) -> None:
    try:
        await sesion.flush()
    except IntegrityError as exc:  # carrera con otra petición
        await sesion.rollback()
        raise traducir(exc, campo) or exc from exc


async def crear(
    sesion: AsyncSession, datos: ClienteCrear, usuario: Usuario, ip: str
) -> ClienteDetalle:
    await _documento_libre(sesion, datos.documento)
    placas = [m.placa for m in datos.motos]
    vistas: set[str] = set()
    for i, placa in enumerate(placas):
        if placa in vistas:
            raise _placa_duplicada(f"motos.{i}.placa")
        vistas.add(placa)
    if placas:
        existentes = set(await sesion.scalars(select(Moto.placa).where(Moto.placa.in_(placas))))
        for i, placa in enumerate(placas):
            if placa in existentes:
                raise _placa_duplicada(f"motos.{i}.placa")

    cliente = Cliente(**datos.model_dump(exclude={"motos"}))
    sesion.add(cliente)
    await _flush(sesion)
    motos = [Moto(cliente_id=cliente.id, **m.model_dump()) for m in datos.motos]
    sesion.add_all(motos)
    await _flush(sesion, "motos.0.placa" if len(motos) == 1 else None)

    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="cliente.crear",
        entidad="cliente",
        entidad_id=cliente.id,
        datos={**{k: a_json(v) for k, v in datos.model_dump(exclude={"motos"}).items()},
               "placas": placas},
        ip=ip,
    )  # fmt: skip
    for moto in motos:
        await registrar_auditoria(
            sesion,
            usuario_id=usuario.id,
            accion="moto.crear",
            entidad="moto",
            entidad_id=moto.id,
            datos={"placa": moto.placa, "cliente_id": str(cliente.id)},
            ip=ip,
        )
    await sesion.commit()
    await sesion.refresh(cliente)
    return await detalle(sesion, cliente)


async def editar(
    sesion: AsyncSession,
    cliente_id: uuid.UUID,
    datos: ClienteEditar,
    usuario: Usuario,
    ip: str,
) -> ClienteDetalle:
    cambios = datos.cambios()
    # RN-12 y matriz de permisos: un operador no puede cambiar `activo` (nada se aplica).
    if "activo" in cambios and usuario.rol != Rol.ADMIN:
        raise ErrorApi("sin_permiso", status=403)
    cliente = await sesion.get(Cliente, cliente_id, with_for_update=True)
    if cliente is None:
        raise ErrorApi("no_encontrado", status=404)
    if "documento" in cambios and cambios["documento"] != cliente.documento:
        await _documento_libre(sesion, cambios["documento"], cliente.id)

    detalle_cambios = diferencias(cliente, cambios)
    desactiva = "activo" in detalle_cambios and cambios["activo"] is False
    motos_a_desactivar: list[uuid.UUID] = []
    if desactiva:
        motos = list(await sesion.scalars(select(Moto.id).where(Moto.cliente_id == cliente.id)))
        if motos and await sesion.scalar(
            select(exists().where(Estancia.moto_id.in_(motos), Estancia.salida_en.is_(None)))
        ):
            raise ErrorApi(
                "cliente_con_moto_dentro",
                "No se puede desactivar: el cliente tiene una moto dentro.",
                409,
            )
        motos_a_desactivar = list(
            await sesion.scalars(select(Moto.id).where(Moto.cliente_id == cliente.id, Moto.activo))
        )

    for campo, valor in cambios.items():
        setattr(cliente, campo, valor)
    await _flush(sesion)

    accion = "cliente.editar"
    if "activo" in detalle_cambios:
        accion = "cliente.activar" if cliente.activo else "cliente.desactivar"
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion=accion,
        entidad="cliente",
        entidad_id=cliente.id,
        datos={"cambios": detalle_cambios},
        ip=ip,
    )
    if motos_a_desactivar:
        await sesion.execute(
            update(Moto).where(Moto.id.in_(motos_a_desactivar)).values(activo=False)
        )
        for moto_id in motos_a_desactivar:
            await registrar_auditoria(
                sesion,
                usuario_id=usuario.id,
                accion="moto.desactivar",
                entidad="moto",
                entidad_id=moto_id,
                datos={"motivo": "cliente_desactivado", "cliente_id": str(cliente.id)},
                ip=ip,
            )
    await sesion.commit()
    await sesion.refresh(cliente)
    return await detalle(sesion, cliente)
