"""Contraseñas (Argon2id), JWT de acceso y refresh tokens opacos."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core import reloj
from app.core.config import obtener_ajustes

ALGORITMO = "HS256"

# Parámetros por defecto de argon2-cffi (Argon2id).
_hasher = PasswordHasher()

# Hash de una contraseña aleatoria: se verifica contra él cuando el email no existe, para que el
# tiempo de respuesta no revele si el email está registrado.
_HASH_SENUELO = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verificar_password(password_hash: str | None, password: str) -> bool:
    try:
        coincide = _hasher.verify(password_hash or _HASH_SENUELO, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return coincide and password_hash is not None


def necesita_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# --- JWT de acceso -------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessToken:
    token: str
    expira_en_segundos: int


def crear_access_token(usuario_id: uuid.UUID, rol: str) -> AccessToken:
    ajustes = obtener_ajustes()
    emitido = reloj.ahora()
    duracion = timedelta(minutes=ajustes.jwt_minutos_acceso)
    payload: dict[str, Any] = {
        "sub": str(usuario_id),
        "rol": rol,
        "iat": int(emitido.timestamp()),
        "exp": int((emitido + duracion).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, ajustes.jwt_secreto, algorithm=ALGORITMO)
    return AccessToken(token=token, expira_en_segundos=int(duracion.total_seconds()))


class TokenInvalido(Exception):
    pass


def decodificar_access_token(token: str) -> dict[str, Any]:
    """Valida firma y vencimiento. El vencimiento se compara con `reloj.ahora()` (no con el
    reloj del sistema) para que las pruebas puedan fijar el tiempo."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            obtener_ajustes().jwt_secreto,
            algorithms=[ALGORITMO],  # lista fija: rechaza "alg: none" y cambios de algoritmo
            options={"require": ["sub", "exp", "iat", "jti"], "verify_exp": False},
        )
    except jwt.PyJWTError as exc:
        raise TokenInvalido(str(exc)) from exc
    exp = payload["exp"]
    if not isinstance(exp, int | float) or reloj.ahora() >= datetime.fromtimestamp(exp, reloj.UTC):
        raise TokenInvalido("token vencido")
    return payload


# --- Refresh tokens -------------------------------------------------------------------------


def generar_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 en hexadecimal. Basta porque el token tiene alta entropía."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
