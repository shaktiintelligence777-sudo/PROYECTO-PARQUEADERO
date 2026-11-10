"""Utilidades compartidas por los servicios de los módulos."""

from datetime import date, datetime
from typing import Any
from uuid import UUID


def a_json(valor: Any) -> Any:
    if isinstance(valor, date | datetime):
        return valor.isoformat()
    if isinstance(valor, UUID):
        return str(valor)
    return valor


def diferencias(objeto: object, cambios: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """{campo: {"antes", "despues"}} solo para los campos que cambian de verdad (para auditoría)."""
    resultado: dict[str, dict[str, Any]] = {}
    for campo, nuevo in cambios.items():
        anterior = getattr(objeto, campo)
        if anterior != nuevo:
            resultado[campo] = {"antes": a_json(anterior), "despues": a_json(nuevo)}
    return resultado
