"""Accesos: entradas, salidas e historial (RN-01, RN-50 a RN-57, CB-1, CB-12)."""

import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import Row, Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.errores import ErrorApi
from app.core.integridad import nombre_restriccion
from app.core.paginacion import ParamsPaginacion
from app.core.placas import normalizar_placa
from app.modules.accesos.models import Estancia
from app.modules.accesos.schemas import (
    AccesoRegistrado,
    ConsultaPlaca,
    MotoEstancia,
    MotosDentro,
    PaginaEstancias,
    UsuarioRef,
)
from app.modules.accesos.schemas import Estancia as EstanciaSalida
from app.modules.auth.models import Usuario
from app.modules.busqueda import solo_alfanumerico
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.consultas import dias_por_vencer, no_canceladas_por_cliente
from app.modules.membresias.estado import Advertencia, advertencias_de
from app.modules.membresias.resumen import MembresiaResumen, resumir
from app.modules.motos.consultas import a_salida
from app.modules.motos.models import Moto
from app.modules.motos.schemas import ClienteRef
from app.modules.planes.models import Plan

RESTRICCION_ESTANCIA_ABIERTA = "uq_estancias_moto_abierta"


def _error_moto_no_registrada() -> ErrorApi:
    return ErrorApi(
        "moto_no_registrada", "No hay ninguna moto registrada con esa placa.", status=404
    )


def _placa_o_422(texto: str) -> str:
    try:
        return normalizar_placa(texto)
    except ValueError as exc:
        raise ErrorApi(
            "validacion",
            status=422,
            detalles=[{"campo": "placa", "mensaje": str(exc)}],
        ) from exc


def _consulta_estancias() -> Select[Estancia, Moto, Cliente, Usuario, Usuario]:
    """Estancia con moto, cliente y operadores en una sola consulta (sin N+1)."""
    op_entrada = aliased(Usuario)
    op_salida = aliased(Usuario)
    return (
        select(Estancia, Moto, Cliente, op_entrada, op_salida)
        .join(Moto, Moto.id == Estancia.moto_id)
        .join(Cliente, Cliente.id == Moto.cliente_id)
        .join(op_entrada, op_entrada.id == Estancia.operador_entrada)
        .outerjoin(op_salida, op_salida.id == Estancia.operador_salida)
    )


def _minutos(entrada: datetime, salida: datetime | None) -> int:
    """Minutos enteros (hacia abajo) hasta la salida, o hasta ahora si sigue dentro."""
    fin = salida if salida is not None else reloj.ahora()
    return max(0, int((fin - entrada).total_seconds() // 60))


def _a_estancia(fila: Row[Estancia, Moto, Cliente, Usuario, Usuario]) -> EstanciaSalida:
    estancia, moto, cliente, op_entrada, op_salida_ = fila
    op_salida: Usuario | None = op_salida_  # el outer join puede traer NULL
    return EstanciaSalida(
        id=estancia.id,
        moto=MotoEstancia(id=moto.id, placa=moto.placa, marca=moto.marca, color=moto.color),
        cliente=ClienteRef.model_validate(cliente),
        entrada_en=estancia.entrada_en,
        salida_en=estancia.salida_en,
        duracion_minutos=_minutos(estancia.entrada_en, estancia.salida_en),
        operador_entrada=UsuarioRef(id=op_entrada.id, nombre=op_entrada.nombre),
        operador_salida=(
            UsuarioRef(id=op_salida.id, nombre=op_salida.nombre) if op_salida is not None else None
        ),
    )


async def _moto_y_cliente(sesion: AsyncSession, placa: str) -> tuple[Moto, Cliente]:
    """RN-51: placa inexistente, moto inactiva o cliente inactivo → 404."""
    fila = (
        await sesion.execute(
            select(Moto, Cliente)
            .join(Cliente, Cliente.id == Moto.cliente_id)
            .where(Moto.placa == placa, Moto.activo.is_(True), Cliente.activo.is_(True))
        )
    ).one_or_none()
    if fila is None:
        raise _error_moto_no_registrada()
    return fila[0], fila[1]


async def _membresia_resumen(
    sesion: AsyncSession, cliente_id: uuid.UUID
) -> tuple[MembresiaResumen | None, list[Advertencia]]:
    """Membresía no cancelada del cliente resumida y las advertencias de RN-52."""
    membresia = (await no_canceladas_por_cliente(sesion, [cliente_id])).get(cliente_id)
    hoy, dpv = reloj.hoy(), await dias_por_vencer(sesion)
    if membresia is None:
        return None, advertencias_de(None, hoy, dpv)
    plan = await sesion.get(Plan, membresia.plan_id)
    assert plan is not None  # noqa: S101 - la FK lo garantiza
    return resumir(membresia, plan, hoy, dpv), advertencias_de(membresia, hoy, dpv)


async def _estancia_por_id(sesion: AsyncSession, estancia_id: uuid.UUID) -> EstanciaSalida:
    fila = (await sesion.execute(_consulta_estancias().where(Estancia.id == estancia_id))).one()
    return _a_estancia(fila)


async def consultar(sesion: AsyncSession, placa_texto: str) -> ConsultaPlaca:
    moto, cliente = await _moto_y_cliente(sesion, _placa_o_422(placa_texto))
    abierta = (
        await sesion.execute(
            _consulta_estancias().where(Estancia.moto_id == moto.id, Estancia.salida_en.is_(None))
        )
    ).one_or_none()
    membresia, advertencias = await _membresia_resumen(sesion, cliente.id)
    return ConsultaPlaca(
        moto=a_salida(moto, {moto.id} if abierta else set()),
        cliente=ClienteRef.model_validate(cliente),
        membresia=membresia,
        estancia_abierta=_a_estancia(abierta) if abierta else None,
        advertencias=advertencias,
    )


async def registrar_entrada(
    sesion: AsyncSession, placa: str, usuario: Usuario, ip: str
) -> AccesoRegistrado:
    moto, cliente = await _moto_y_cliente(sesion, placa)
    estancia = Estancia(moto_id=moto.id, entrada_en=reloj.ahora(), operador_entrada=usuario.id)
    # La protección real es el índice único parcial (CB-1); el savepoint deja intacta la
    # transacción si la base rechaza la inserción.
    try:
        async with sesion.begin_nested():
            sesion.add(estancia)
            await sesion.flush()
    except IntegrityError as exc:
        if nombre_restriccion(exc) == RESTRICCION_ESTANCIA_ABIERTA:
            raise ErrorApi(
                "moto_ya_dentro", "Esa moto ya está dentro del parqueadero.", status=409
            ) from exc
        raise
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="acceso.entrada",
        entidad="estancia",
        entidad_id=estancia.id,
        datos={"placa": moto.placa},
        ip=ip,
    )
    membresia, advertencias = await _membresia_resumen(sesion, cliente.id)
    await sesion.commit()
    return AccesoRegistrado(
        estancia=await _estancia_por_id(sesion, estancia.id),
        membresia=membresia,
        advertencias=advertencias,
    )


async def registrar_salida(
    sesion: AsyncSession, placa: str, usuario: Usuario, ip: str
) -> AccesoRegistrado:
    moto, cliente = await _moto_y_cliente(sesion, placa)
    estancia = await sesion.scalar(
        select(Estancia)
        .where(Estancia.moto_id == moto.id, Estancia.salida_en.is_(None))
        .with_for_update()
    )
    if estancia is None:
        raise ErrorApi(
            "moto_no_esta_dentro", "Esa moto no está dentro del parqueadero.", status=409
        )
    estancia.salida_en = reloj.ahora()
    estancia.operador_salida = usuario.id
    await sesion.flush()
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="acceso.salida",
        entidad="estancia",
        entidad_id=estancia.id,
        datos={"placa": moto.placa},
        ip=ip,
    )
    membresia, _ = await _membresia_resumen(sesion, cliente.id)
    await sesion.commit()
    return AccesoRegistrado(
        estancia=await _estancia_por_id(sesion, estancia.id),
        membresia=membresia,
        advertencias=[],  # RN-53: la salida nunca advierte
    )


async def listar_dentro(sesion: AsyncSession, placa: str | None) -> MotosDentro:
    consulta = _consulta_estancias().where(Estancia.salida_en.is_(None))
    if placa and (prefijo := solo_alfanumerico(placa)):
        consulta = consulta.where(Moto.placa.startswith(prefijo, autoescape=True))
    filas = (await sesion.execute(consulta.order_by(Estancia.entrada_en.asc()))).all()
    capacidad = await sesion.scalar(select(Configuracion.capacidad).where(Configuracion.id == 1))
    return MotosDentro(
        items=[_a_estancia(f) for f in filas],
        total=len(filas),
        capacidad=capacidad,
    )


def _limites_dia(dia: date) -> tuple[datetime, datetime]:
    """[inicio, fin) del día completo en la zona del negocio (CB-12)."""
    zona = reloj.zona()
    inicio = datetime.combine(dia, time.min, tzinfo=zona)
    fin = datetime.combine(dia + timedelta(days=1), time.min, tzinfo=zona)
    return inicio, fin


async def listar_historial(
    sesion: AsyncSession,
    pag: ParamsPaginacion,
    desde: date | None,
    hasta: date | None,
    placa: str | None,
    operador_id: uuid.UUID | None,
    cliente_id: uuid.UUID | None,
) -> PaginaEstancias:
    consulta = _consulta_estancias()
    if desde is not None:
        consulta = consulta.where(Estancia.entrada_en >= _limites_dia(desde)[0])
    if hasta is not None:
        consulta = consulta.where(Estancia.entrada_en < _limites_dia(hasta)[1])
    if placa and (prefijo := solo_alfanumerico(placa)):
        consulta = consulta.where(Moto.placa.startswith(prefijo, autoescape=True))
    if operador_id is not None:
        consulta = consulta.where(
            or_(
                Estancia.operador_entrada == operador_id,
                Estancia.operador_salida == operador_id,
            )
        )
    if cliente_id is not None:
        consulta = consulta.where(Moto.cliente_id == cliente_id)
    total = await sesion.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    filas = (
        await sesion.execute(
            consulta.order_by(Estancia.entrada_en.desc(), Estancia.id)
            .offset(pag.offset)
            .limit(pag.por_pagina)
        )
    ).all()
    return PaginaEstancias(
        items=[_a_estancia(f) for f in filas],
        total=total,
        pagina=pag.pagina,
        por_pagina=pag.por_pagina,
    )
