"""B-04 CA-15 · estado calculado (pieza compartida, construida con B-05)."""

from datetime import UTC, date, datetime

import pytest

from app.modules.membresias.estado import (
    Advertencia,
    EstadoMembresia,
    advertencias_de,
    calcular_estado,
    dias_restantes,
)

HOY = date(2026, 11, 10)
CANCELADA = datetime(2026, 11, 1, tzinfo=UTC)


@pytest.mark.parametrize(
    ("vence", "cancelada", "esperado"),
    [
        (date(2026, 11, 20), CANCELADA, EstadoMembresia.CANCELADA),
        (date(2026, 11, 9), None, EstadoMembresia.VENCIDA),  # el día siguiente al vencimiento
        (date(2026, 11, 10), None, EstadoMembresia.POR_VENCER),  # el mismo día
        (date(2026, 11, 13), None, EstadoMembresia.POR_VENCER),  # dias_por_vencer días antes
        (date(2026, 11, 14), None, EstadoMembresia.ACTIVA),  # un día más de margen
    ],
)
def test_ca15_calcular_estado_en_los_limites(
    vence: date, cancelada: datetime | None, esperado: EstadoMembresia
) -> None:
    assert calcular_estado(vence, cancelada, HOY, 3) == esperado


def test_dias_por_vencer_cero() -> None:
    assert calcular_estado(HOY, None, HOY, 0) == EstadoMembresia.POR_VENCER
    assert calcular_estado(date(2026, 11, 11), None, HOY, 0) == EstadoMembresia.ACTIVA


def test_dias_restantes() -> None:
    assert dias_restantes(date(2026, 11, 12), HOY) == 2
    assert dias_restantes(date(2026, 11, 1), HOY) == -9


class _M:
    def __init__(self, vence: date, cancelada: datetime | None = None) -> None:
        self.fecha_vencimiento = vence
        self.cancelada_en = cancelada


def test_advertencias() -> None:
    assert advertencias_de(None, HOY, 3) == [Advertencia.SIN_MEMBRESIA]
    assert advertencias_de(_M(HOY, CANCELADA), HOY, 3) == [Advertencia.SIN_MEMBRESIA]
    assert advertencias_de(_M(date(2026, 11, 1)), HOY, 3) == [Advertencia.MEMBRESIA_VENCIDA]
    assert advertencias_de(_M(HOY), HOY, 3) == [Advertencia.MEMBRESIA_POR_VENCER]
    assert advertencias_de(_M(date(2026, 12, 1)), HOY, 3) == []
