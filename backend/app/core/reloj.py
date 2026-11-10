"""Única fuente de “ahora” y “hoy” del sistema. Las pruebas lo fijan con `fijar()`."""

from datetime import UTC, date, datetime

__all__ = ["UTC", "ahora", "fijar", "hoy", "zona"]
from zoneinfo import ZoneInfo

from app.core.config import obtener_ajustes

_fijo: datetime | None = None


def ahora() -> datetime:
    """Instante actual en UTC, con zona."""
    return _fijo if _fijo is not None else datetime.now(UTC)


def zona() -> ZoneInfo:
    return ZoneInfo(obtener_ajustes().zona_horaria)


def hoy() -> date:
    """Fecha actual en la zona horaria del negocio (America/Bogota)."""
    return ahora().astimezone(zona()).date()


def fijar(instante: datetime | None) -> None:
    """Fija el reloj (solo para pruebas). `None` vuelve al reloj real."""
    global _fijo
    if instante is not None and instante.tzinfo is None:
        raise ValueError("El instante debe tener zona horaria")
    _fijo = instante.astimezone(UTC) if instante is not None else None
