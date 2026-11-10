"""Dependencias de FastAPI para los demás módulos: usuario actual, roles, token de servicio, IP."""

import hmac
import ipaddress
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import obtener_ajustes
from app.core.errores import ErrorApi
from app.core.seguridad import TokenInvalido, decodificar_access_token
from app.db.sesion import obtener_sesion
from app.db.tipos import Rol
from app.modules.auth.models import Usuario

_bearer = HTTPBearer(auto_error=False)

IP_DESCONOCIDA = "0.0.0.0"  # noqa: S104 - solo se guarda, no se usa para escuchar


def _no_autenticado() -> ErrorApi:
    return ErrorApi("no_autenticado", status=401, cabeceras={"WWW-Authenticate": "Bearer"})


def _token_invalido() -> ErrorApi:
    return ErrorApi("token_invalido", status=401, cabeceras={"WWW-Authenticate": "Bearer"})


def ip_cliente(request: Request) -> str:
    """IP del cliente. Detrás del proxy de Render (solo en producción) se usa el primer valor de
    X-Forwarded-For; en otro caso la del socket. Siempre devuelve una IP válida para `inet`."""
    candidata: str | None = None
    if obtener_ajustes().entorno == "produccion":
        reenviada = request.headers.get("x-forwarded-for")
        if reenviada:
            candidata = reenviada.split(",")[0].strip()
    if candidata is None and request.client:
        candidata = request.client.host
    try:
        return str(ipaddress.ip_address(candidata or ""))
    except ValueError:
        return IP_DESCONOCIDA


async def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Usuario:
    if credenciales is None:
        raise _no_autenticado()
    try:
        payload = decodificar_access_token(credenciales.credentials)
        usuario_id = uuid.UUID(str(payload["sub"]))
    except (TokenInvalido, ValueError) as exc:
        raise _token_invalido() from exc
    usuario = await sesion.get(Usuario, usuario_id)
    if usuario is None or not usuario.activo:
        raise _token_invalido()
    return usuario


def requiere_rol(*roles: Rol | str) -> Callable[..., Awaitable[Usuario]]:
    """Uso: `Depends(requiere_rol("admin"))`. El rol se lee de la base de datos (no del token),
    así un cambio de rol tiene efecto inmediato."""
    permitidos = {Rol(r) for r in roles}

    async def _dependencia(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in permitidos:
            raise ErrorApi("sin_permiso", status=403)
        return usuario

    return _dependencia


async def requiere_token_servicio(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Protege /internal/*. Un JWT de usuario, aunque sea válido, no sirve aquí."""
    if credenciales is None:
        raise _no_autenticado()
    esperado = obtener_ajustes().service_token.encode()
    if not hmac.compare_digest(credenciales.credentials.encode(), esperado):
        raise _token_invalido()
