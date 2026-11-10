"""Ayudas compartidas por las pruebas de membresías y pagos (B-06)."""

from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from httpx import AsyncClient

HOY = date(2026, 11, 10)
# 10:00 en Bogotá (UTC−5).
AHORA = datetime(2026, 11, 10, 15, 0, tzinfo=UTC)


def fijar_hoy(reloj_fijo: Callable[[datetime], None], instante: datetime = AHORA) -> None:
    reloj_fijo(instante)


async def alta(
    cliente: AsyncClient,
    cabeceras: dict[str, str],
    cliente_id: Any,
    plan_id: Any,
    monto: int = 60000,
    **extra: Any,
) -> Any:
    cuerpo: dict[str, Any] = {
        "cliente_id": str(cliente_id),
        "plan_id": str(plan_id),
        "pago_inicial": {"monto": monto, "metodo": "efectivo", **extra.pop("pago", {})},
        **extra,
    }
    return await cliente.post("/membresias", json=cuerpo, headers=cabeceras)


async def pagar(
    cliente: AsyncClient, cabeceras: dict[str, str], membresia_id: Any, monto: int, **extra: Any
) -> Any:
    cuerpo = {"membresia_id": str(membresia_id), "monto": monto, "metodo": "efectivo", **extra}
    return await cliente.post("/pagos", json=cuerpo, headers=cabeceras)


def codigo(respuesta: Any) -> str:
    return str(respuesta.json()["error"]["codigo"])
