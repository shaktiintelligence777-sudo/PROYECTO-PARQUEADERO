"""Registro de auditoría (RN-76). Se llama dentro de la misma transacción que la escritura."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auditoria.models import Auditoria

CLAVES_SENSIBLES = frozenset(
    {"password", "password_hash", "token", "access_token", "refresh_token"}
)


def sanear(valor: Any) -> Any:
    """Quita las claves sensibles a cualquier profundidad."""
    if isinstance(valor, dict):
        return {k: sanear(v) for k, v in valor.items() if k not in CLAVES_SENSIBLES}
    if isinstance(valor, list | tuple):
        return [sanear(v) for v in valor]
    return valor


async def registrar_auditoria(
    sesion: AsyncSession,
    *,
    usuario_id: uuid.UUID | None,
    accion: str,
    entidad: str,
    entidad_id: uuid.UUID | None = None,
    datos: dict[str, Any] | None = None,
    ip: str | None = None,
) -> Auditoria:
    fila = Auditoria(
        usuario_id=usuario_id,
        accion=accion,
        entidad=entidad,
        entidad_id=entidad_id,
        datos=sanear(datos or {}),
        ip=ip,
    )
    sesion.add(fila)
    await sesion.flush()
    return fila
