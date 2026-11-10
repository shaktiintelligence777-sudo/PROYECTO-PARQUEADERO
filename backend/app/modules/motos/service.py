"""Motos (RN-01, RN-11, RN-13, RN-14)."""

import uuid

from sqlalchemy import Select, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.integridad import UNICIDAD, error_duplicado, traducir
from app.core.paginacion import ParamsPaginacion
from app.db.tipos import Rol
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.busqueda import solo_alfanumerico
from app.modules.clientes.models import Cliente
from app.modules.motos.consultas import a_salida, ids_dentro
from app.modules.motos.models import Moto
from app.modules.motos.schemas import ClienteRef, MotoConCliente, MotoCrearConCliente, MotoEditar
from app.modules.motos.schemas import Moto as MotoSalida
from app.modules.utilidades import diferencias

CAMPOS_ADMIN = frozenset({"activo", "cliente_id"})


async def listar(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    placa: str | None,
    cliente_id: uuid.UUID | None,
    activo: bool,
) -> tuple[list[MotoConCliente], int]:
    consulta: Select[Moto, Cliente] = (
        select(Moto, Cliente)
        .join(Cliente, Cliente.id == Moto.cliente_id)
        .where(Moto.activo.is_(activo))
    )
    if placa and (prefijo := solo_alfanumerico(placa)):
        consulta = consulta.where(Moto.placa.startswith(prefijo, autoescape=True))
    if cliente_id is not None:
        consulta = consulta.where(Moto.cliente_id == cliente_id)
    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    filas = (
        await sesion.execute(consulta.order_by(Moto.placa).offset(pag.offset).limit(pag.por_pagina))
    ).all()
    dentro = await ids_dentro(sesion, (m.id for m, _ in filas))
    items = [
        MotoConCliente(**a_salida(m, dentro).model_dump(), cliente=ClienteRef.model_validate(c))
        for m, c in filas
    ]
    return items, total


async def _cliente_activo(sesion: AsyncSession, cliente_id: uuid.UUID) -> Cliente:
    cliente = await sesion.get(Cliente, cliente_id)
    if cliente is None or not cliente.activo:
        raise ErrorApi("no_encontrado", "El cliente no existe o está inactivo.", 404)
    return cliente


async def _placa_libre(sesion: AsyncSession, placa: str, excepto: uuid.UUID | None) -> None:
    consulta = select(Moto.id).where(Moto.placa == placa)
    if excepto is not None:
        consulta = consulta.where(Moto.id != excepto)
    if await sesion.scalar(consulta) is not None:
        raise error_duplicado(*UNICIDAD["uq_motos_placa"])


async def _flush(sesion: AsyncSession) -> None:
    try:
        await sesion.flush()
    except IntegrityError as exc:
        await sesion.rollback()
        raise traducir(exc) or exc from exc


async def _salida(sesion: AsyncSession, moto: Moto) -> MotoSalida:
    return a_salida(moto, await ids_dentro(sesion, [moto.id]))


async def crear(
    sesion: AsyncSession, datos: MotoCrearConCliente, usuario: Usuario, ip: str
) -> MotoSalida:
    await _cliente_activo(sesion, datos.cliente_id)
    await _placa_libre(sesion, datos.placa, None)
    moto = Moto(**datos.model_dump())
    sesion.add(moto)
    await _flush(sesion)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="moto.crear",
        entidad="moto",
        entidad_id=moto.id,
        datos={**datos.model_dump(), "cliente_id": str(datos.cliente_id)},
        ip=ip,
    )
    await sesion.commit()
    await sesion.refresh(moto)
    return await _salida(sesion, moto)


async def editar(
    sesion: AsyncSession, moto_id: uuid.UUID, datos: MotoEditar, usuario: Usuario, ip: str
) -> MotoSalida:
    cambios = datos.cambios()
    if CAMPOS_ADMIN & cambios.keys() and usuario.rol != Rol.ADMIN:
        raise ErrorApi("sin_permiso", status=403)
    moto = await sesion.get(Moto, moto_id, with_for_update=True)
    if moto is None:
        raise ErrorApi("no_encontrado", status=404)
    if "placa" in cambios and cambios["placa"] != moto.placa:
        await _placa_libre(sesion, cambios["placa"], moto.id)
    if "cliente_id" in cambios and cambios["cliente_id"] != moto.cliente_id:
        await _cliente_activo(sesion, cambios["cliente_id"])
    if cambios.get("activo") is False and moto.activo:
        dentro = await sesion.scalar(
            select(exists().where(Estancia.moto_id == moto.id, Estancia.salida_en.is_(None)))
        )
        if dentro:
            raise ErrorApi("moto_dentro", "No se puede desactivar: la moto está dentro.", 409)

    detalle = diferencias(moto, cambios)
    for campo, valor in cambios.items():
        setattr(moto, campo, valor)
    await _flush(sesion)
    accion = "moto.editar"
    if "activo" in detalle:
        accion = "moto.activar" if moto.activo else "moto.desactivar"
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion=accion,
        entidad="moto",
        entidad_id=moto.id,
        datos={"cambios": detalle},
        ip=ip,
    )
    await sesion.commit()
    await sesion.refresh(moto)
    return await _salida(sesion, moto)
