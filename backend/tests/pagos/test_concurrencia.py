"""B-06 · CA-2, CA-16 y CA-22 con transacciones reales.

Estas pruebas no usan la transacción revertida de las demás: cada petición abre su propia
sesión contra PostgreSQL para que los bloqueos y el índice único actúen entre conexiones
distintas. Al final se vacían las tablas tocadas.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.seguridad import hash_password
from app.db.sesion import obtener_motor
from app.db.tipos import Rol
from app.main import crear_app
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import Membresia
from app.modules.pagos import service as pagos_service
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan
from tests.conftest import PASSWORD, cabeceras


@pytest.fixture
async def datos_reales(motor: AsyncEngine) -> AsyncIterator[dict[str, Any]]:
    async with AsyncSession(motor, expire_on_commit=False) as s:
        usuario = Usuario(
            email=f"concurrente-{uuid.uuid4().hex[:8]}@parqueadero.app",
            password_hash=hash_password(PASSWORD),
            nombre="Concurrente",
            rol=Rol.OPERADOR,
        )
        plan = Plan(nombre=f"Mensual {uuid.uuid4().hex[:6]}", duracion_dias=30, precio=60000)
        cliente = Cliente(
            nombre="Cliente concurrente", documento=f"9{uuid.uuid4().int % 10**9:09d}",
            telefono="3001234567",
        )  # fmt: skip
        s.add_all([usuario, plan, cliente])
        await s.commit()
    try:
        yield {"usuario": usuario, "plan": plan, "cliente": cliente}
    finally:
        async with motor.begin() as conexion:
            await conexion.execute(
                text(
                    "TRUNCATE pagos, notificaciones, membresias, motos, clientes, planes, "
                    "auditoria, refresh_tokens, intentos_login, usuarios RESTART IDENTITY CASCADE"
                )
            )
        await obtener_motor().dispose()


def _cliente_http() -> httpx.AsyncClient:
    transporte = httpx.ASGITransport(app=crear_app(), raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transporte, base_url="http://t/api/v1")


def _cuerpo_alta(datos: dict[str, Any]) -> dict[str, Any]:
    return {
        "cliente_id": str(datos["cliente"].id),
        "plan_id": str(datos["plan"].id),
        "pago_inicial": {"monto": 60000, "metodo": "efectivo"},
    }


async def test_ca2_dos_altas_simultaneas_dejan_una_sola_membresia(
    motor: AsyncEngine, datos_reales: dict[str, Any]
) -> None:
    h = cabeceras(datos_reales["usuario"])
    async with _cliente_http() as c:
        respuestas = await asyncio.gather(
            *(c.post("/membresias", json=_cuerpo_alta(datos_reales), headers=h) for _ in range(3))
        )
    codigos = sorted(r.status_code for r in respuestas)
    assert codigos == [201, 409, 409], [r.text for r in respuestas]
    assert {r.json()["error"]["codigo"] for r in respuestas if r.status_code == 409} == {
        "membresia_existente"
    }
    async with AsyncSession(motor) as s:
        total = await s.scalar(
            select(func.count())
            .select_from(Membresia)
            .where(Membresia.cliente_id == datos_reales["cliente"].id)
        )
        assert total == 1
        assert await s.scalar(select(func.count()).select_from(Pago)) == 1


async def test_ca16_dos_pagos_simultaneos_suman_sin_solaparse(
    motor: AsyncEngine, datos_reales: dict[str, Any]
) -> None:
    h = cabeceras(datos_reales["usuario"])
    async with _cliente_http() as c:
        r = await c.post("/membresias", json=_cuerpo_alta(datos_reales), headers=h)
        assert r.status_code == 201, r.text
        membresia_id = r.json()["id"]
        vence = r.json()["fecha_vencimiento"]
        cuerpo = {"membresia_id": membresia_id, "monto": 60000, "metodo": "efectivo"}
        respuestas = await asyncio.gather(*(c.post("/pagos", json=cuerpo, headers=h) for _ in "ab"))
    assert [r.status_code for r in respuestas] == [201, 201], [r.text for r in respuestas]

    async with AsyncSession(motor) as s:
        m = await s.get(Membresia, uuid.UUID(membresia_id))
        assert m is not None
        assert m.fecha_vencimiento.isoformat() == _mas_dias(vence, 60)
        nuevos = list(
            await s.scalars(
                select(Pago)
                .where(Pago.membresia_id == m.id, Pago.vencimiento_anterior.is_not(None))
                .order_by(Pago.periodo_desde)
            )
        )
    assert len(nuevos) == 2
    primero, segundo = nuevos
    assert primero.periodo_desde.isoformat() == _mas_dias(vence, 1)
    assert segundo.periodo_desde == primero.periodo_hasta + timedelta(days=1)
    assert segundo.vencimiento_anterior == primero.periodo_hasta


async def test_ca22_fallo_tras_insertar_pago_no_deja_rastro(
    motor: AsyncEngine, datos_reales: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    h = cabeceras(datos_reales["usuario"])
    async with _cliente_http() as c:
        r = await c.post("/membresias", json=_cuerpo_alta(datos_reales), headers=h)
        membresia_id, vence = r.json()["id"], r.json()["fecha_vencimiento"]

        async def _fallar(*_: Any) -> None:
            raise RuntimeError("fallo forzado entre el pago y la membresía")

        monkeypatch.setattr(pagos_service, "_extender", _fallar)
        cuerpo = {"membresia_id": membresia_id, "monto": 60000, "metodo": "efectivo"}
        r = await c.post("/pagos", json=cuerpo, headers=h)
    assert r.status_code == 500
    assert r.json()["error"]["codigo"] == "error_interno"

    async with AsyncSession(motor) as s:
        m = await s.get(Membresia, uuid.UUID(membresia_id))
        assert m is not None and m.fecha_vencimiento.isoformat() == vence
        pagos = await s.scalar(
            select(func.count()).select_from(Pago).where(Pago.membresia_id == m.id)
        )
        assert pagos == 1  # solo el inicial
        acciones = list(
            await s.scalars(text("SELECT accion FROM auditoria WHERE accion = 'pago.registrar'"))
        )
        assert len(acciones) == 1  # el del pago inicial


def _mas_dias(fecha_iso: str, dias: int) -> str:
    return (date.fromisoformat(fecha_iso) + timedelta(days=dias)).isoformat()
