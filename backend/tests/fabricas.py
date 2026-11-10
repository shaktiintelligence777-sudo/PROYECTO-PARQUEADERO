"""Fábricas de datos para pruebas de módulos de negocio."""

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import Membresia
from app.modules.motos.models import Moto
from app.modules.planes.models import Plan

_contador = 0


def _n() -> int:
    global _contador
    _contador += 1
    return _contador


async def plan(
    sesion: AsyncSession, nombre: str | None = None, dias: int = 30, precio: int = 60000,
    activo: bool = True,
) -> Plan:  # fmt: skip
    p = Plan(nombre=nombre or f"Plan {_n()}", duracion_dias=dias, precio=precio, activo=activo)
    sesion.add(p)
    await sesion.flush()
    return p


async def cliente(
    sesion: AsyncSession, nombre: str | None = None, placas: tuple[str, ...] = (), **extra: Any
) -> Cliente:
    n = _n()
    c = Cliente(
        nombre=nombre or f"Cliente {n:03d}",
        documento=extra.pop("documento", f"8{n:08d}"),
        telefono=extra.pop("telefono", "3001234567"),
        **extra,
    )
    sesion.add(c)
    await sesion.flush()
    for placa in placas:
        sesion.add(Moto(cliente_id=c.id, placa=placa))
    await sesion.flush()
    return c


async def membresia(
    sesion: AsyncSession,
    cliente_id: uuid.UUID,
    plan_: Plan,
    vence: date,
    cancelada_por: Usuario | None = None,
) -> Membresia:
    m = Membresia(
        cliente_id=cliente_id,
        plan_id=plan_.id,
        fecha_inicio=vence - timedelta(days=plan_.duracion_dias - 1),
        fecha_vencimiento=vence,
    )
    if cancelada_por is not None:
        m.cancelada_en = reloj.ahora()
        m.cancelada_por = cancelada_por.id
        m.motivo_cancelacion = "Prueba"
    sesion.add(m)
    await sesion.flush()
    return m


async def dentro(sesion: AsyncSession, moto_id: uuid.UUID, operador: Usuario) -> Estancia:
    e = Estancia(moto_id=moto_id, entrada_en=reloj.ahora(), operador_entrada=operador.id)
    sesion.add(e)
    await sesion.flush()
    return e
