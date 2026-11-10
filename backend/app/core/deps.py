"""Dependencias comunes de FastAPI: sesión, usuario actual, roles, token de servicio, IP."""

import hmac
import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import TokenInvalido, decodificar_access_token
from app.db.session import get_db
from app.modules.usuarios.models import Rol, Usuario

_bearer = HTTPBearer(auto_error=False)


def _no_autenticado(detalle: str = "No autenticado") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalle,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_ip(request: Request) -> str | None:
    # Detrás del proxy del hosting, uvicorn corre con --proxy-headers y request.client ya es
    # la IP real del cliente.
    return request.client.host if request.client else None


def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if credenciales is None or credenciales.scheme.lower() != "bearer":
        raise _no_autenticado()
    try:
        payload = decodificar_access_token(credenciales.credentials)
        usuario_id = uuid.UUID(payload["sub"])
    except (TokenInvalido, ValueError) as exc:
        raise _no_autenticado("Token inválido o expirado") from exc

    usuario = db.get(Usuario, usuario_id)
    if usuario is None or not usuario.activo:
        raise _no_autenticado("Token inválido o expirado")
    return usuario


def requiere_rol(*roles: Rol) -> Callable[..., Usuario]:
    """Uso: `usuario: Usuario = Depends(requiere_rol(Rol.ADMIN))`. El rol se lee de la BD, no
    del token, para que un cambio de rol tenga efecto inmediato."""

    permitidos = set(roles)

    def _dep(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
        if usuario.rol not in permitidos:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado")
        return usuario

    return _dep


def requiere_token_servicio(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Protege /internal/*: token de servicio fijo (no un JWT de usuario)."""
    esperado = get_settings().internal_job_token
    if not esperado or credenciales is None:
        raise _no_autenticado()
    if not hmac.compare_digest(credenciales.credentials.encode(), esperado.encode()):
        raise _no_autenticado()
