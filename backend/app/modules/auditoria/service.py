"""Registro de auditoría. Cada servicio que escribe datos debe llamar a `registrar` dentro de la
misma transacción que la escritura, para que ambas se confirmen o se reviertan juntas."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.modules.auditoria.models import Auditoria

# Claves que nunca deben quedar en `datos`, aunque un servicio las pase por error.
_CLAVES_SENSIBLES = {"password", "password_hash", "token", "refresh_token", "access_token"}


def registrar(
    db: Session,
    *,
    accion: str,
    entidad: str,
    entidad_id: uuid.UUID | str | None = None,
    usuario_id: uuid.UUID | None = None,
    datos: dict[str, Any] | None = None,
    ip: str | None = None,
) -> Auditoria:
    limpio = {k: v for k, v in (datos or {}).items() if k not in _CLAVES_SENSIBLES} or None
    fila = Auditoria(
        accion=accion,
        entidad=entidad,
        entidad_id=str(entidad_id) if entidad_id is not None else None,
        usuario_id=usuario_id,
        datos=limpio,
        ip=ip,
    )
    db.add(fila)
    return fila
