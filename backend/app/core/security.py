"""Hash de contraseñas (Argon2id), JWT de acceso y refresh tokens opacos."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

# Parámetros por defecto de argon2-cffi (perfil RFC 9106 de bajo consumo de memoria), tipo Argon2id.
_hasher = PasswordHasher()

# Hash de una contraseña aleatoria: se verifica contra él cuando el email no existe, para que
# el tiempo de respuesta no revele qué emails están registrados.
_HASH_SEÑUELO = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verificar_password(password_hash: str | None, password: str) -> bool:
    try:
        ok = _hasher.verify(password_hash or _HASH_SEÑUELO, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return ok and password_hash is not None


def necesita_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# --- JWT de acceso -------------------------------------------------------------------------

AUDIENCIA_ACCESO = "parqueadero-app"


@dataclass(frozen=True)
class AccessToken:
    token: str
    expira_en_segundos: int


def crear_access_token(
    usuario_id: uuid.UUID, rol: str, ahora: datetime | None = None
) -> AccessToken:
    settings = get_settings()
    ahora = ahora or datetime.now(UTC)
    duracion = timedelta(minutes=settings.access_token_minutos)
    payload: dict[str, Any] = {
        "sub": str(usuario_id),
        "rol": rol,
        "typ": "access",
        "iss": settings.jwt_emisor,
        "aud": AUDIENCIA_ACCESO,
        "iat": ahora,
        "nbf": ahora,
        "exp": ahora + duracion,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algoritmo)
    return AccessToken(token=token, expira_en_segundos=int(duracion.total_seconds()))


class TokenInvalido(Exception):
    pass


def decodificar_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algoritmo],  # lista fija: evita el ataque "alg: none"
            audience=AUDIENCIA_ACCESO,
            issuer=settings.jwt_emisor,
            options={"require": ["exp", "iat", "sub", "typ", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenInvalido(str(exc)) from exc
    if payload.get("typ") != "access":
        raise TokenInvalido("tipo de token incorrecto")
    return payload


# --- Refresh tokens --------------------------------------------------------------------------


def generar_refresh_token() -> str:
    """Token opaco de 384 bits. Al cliente se le entrega en claro; en la BD solo su hash."""
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    # SHA-256 basta: el token tiene alta entropía, no es una contraseña elegida por una persona.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
