"""B-02 · semilla."""

from datetime import date

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.config import Ajustes
from app.db import semilla
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.motos.models import Moto
from app.modules.pagos.models import Pago

TABLAS = (
    "usuarios",
    "clientes",
    "motos",
    "planes",
    "membresias",
    "pagos",
    "estancias",
    "auditoria",
)


async def _conteos(sesion: AsyncSession) -> dict[str, int]:
    return {
        t: (await sesion.scalar(text(f"SELECT count(*) FROM {t}"))) or 0  # noqa: S608
        for t in TABLAS
    }


async def _estados(sesion: AsyncSession) -> dict[str, int]:
    """Estado calculado de RN-32 (la función definitiva llega con B-04/B-06)."""
    filas = await sesion.execute(
        text(
            """
            SELECT CASE
                WHEN m.cancelada_en IS NOT NULL THEN 'cancelada'
                WHEN :hoy > m.fecha_vencimiento THEN 'vencida'
                WHEN m.fecha_vencimiento - :hoy <= c.dias_por_vencer THEN 'por_vencer'
                ELSE 'activa'
            END AS estado, count(*)
            FROM membresias m CROSS JOIN configuracion c
            GROUP BY 1
            """
        ),
        {"hoy": reloj.hoy()},
    )
    return {estado: n for estado, n in filas.all()}


async def test_ca12_semilla_idempotente_y_con_los_cuatro_estados(sesion: AsyncSession) -> None:
    assert await semilla.sembrar(sesion) is True
    despues_de_la_primera = await _conteos(sesion)
    assert await semilla.sembrar(sesion) is False
    assert await _conteos(sesion) == despues_de_la_primera

    assert await _estados(sesion) == {"activa": 6, "por_vencer": 2, "vencida": 2, "cancelada": 1}


async def test_semilla_cumple_dominio_seccion_6(sesion: AsyncSession) -> None:
    await semilla.sembrar(sesion)
    hoy: date = reloj.hoy()

    demo = await sesion.scalar(select(Usuario).where(Usuario.email == "demo@parqueadero.app"))
    assert demo is not None and demo.rol == "admin"
    assert await sesion.scalar(select(func.count()).select_from(Cliente)) == 12
    assert await sesion.scalar(select(func.count()).where(Cliente.email.is_(None))) == 1
    motos_por_cliente = (
        await sesion.execute(select(Moto.cliente_id, func.count()).group_by(Moto.cliente_id))
    ).all()
    assert sum(1 for _, n in motos_por_cliente if n >= 2) >= 2

    dentro = (await sesion.scalars(select(Estancia).where(Estancia.salida_en.is_(None)))).all()
    assert len(dentro) >= 5
    assert any((reloj.ahora() - e.entrada_en).total_seconds() > 24 * 3600 for e in dentro)
    assert await sesion.scalar(select(func.count()).where(Estancia.salida_en.is_not(None))) == 30

    pagos = (await sesion.scalars(select(Pago))).all()
    de_hoy = [p for p in pagos if p.creado_en.astimezone(reloj.zona()).date() == hoy]
    assert len(de_hoy) == 2
    assert sum(1 for p in pagos if p.anulado_en is not None) == 1

    config = await sesion.get(Configuracion, 1)
    assert config is not None
    assert (config.nombre_parqueadero, config.capacidad) == ("Parqueadero Demo", 40)


async def test_ca13_semilla_se_niega_en_produccion() -> None:
    ajustes = Ajustes(
        ENTORNO="produccion",
        DATABASE_URL="postgresql://h/db",
        JWT_SECRETO="x" * 32,
        SERVICE_TOKEN="y" * 32,
    )

    def fabrica_prohibida() -> None:
        raise AssertionError("no debe abrir ninguna sesión")

    with pytest.raises(semilla.SemillaEnProduccion):
        await semilla.ejecutar(ajustes, fabrica_prohibida)  # type: ignore[arg-type]
