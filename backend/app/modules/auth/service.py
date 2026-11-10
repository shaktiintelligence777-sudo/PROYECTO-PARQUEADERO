"""Lógica de autenticación: login con límite de intentos, refresh rotativo y logout."""

import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    crear_access_token,
    generar_refresh_token,
    hash_password,
    hash_token,
    necesita_rehash,
    verificar_password,
)
from app.modules.auditoria.service import registrar
from app.modules.auth.models import IntentoLogin, RefreshToken
from app.modules.usuarios.models import Usuario


class CredencialesInvalidas(Exception):
    pass


class DemasiadosIntentos(Exception):
    def __init__(self, reintentar_en: int) -> None:
        super().__init__("Demasiados intentos")
        self.reintentar_en = reintentar_en


class RefreshInvalido(Exception):
    pass


@dataclass(frozen=True)
class Sesion:
    usuario: Usuario
    access_token: str
    refresh_token: str
    expires_in: int


def normalizar_email(email: str) -> str:
    return email.strip().lower()


def _ahora() -> datetime:
    return datetime.now(UTC)


# --- Límite de intentos -------------------------------------------------------------------


def _segundos_bloqueo(db: Session, columna, valor: str, maximo: int, ventana: int) -> int:
    """Si hay `maximo` fallos o más dentro de la ventana, devuelve los segundos que faltan para
    que el más antiguo de ellos salga de la ventana; si no, 0."""
    desde = _ahora() - timedelta(seconds=ventana)
    fallos = (
        select(IntentoLogin.creado_en)
        .where(columna == valor, IntentoLogin.exitoso.is_(False), IntentoLogin.creado_en > desde)
        .order_by(IntentoLogin.creado_en.desc())
        .limit(maximo)
        .subquery()
    )
    total, mas_antiguo = db.execute(select(func.count(), func.min(fallos.c.creado_en))).one()
    if total < maximo:
        return 0
    restante = (mas_antiguo + timedelta(seconds=ventana) - _ahora()).total_seconds()
    return max(1, math.ceil(restante))


def _verificar_limite(db: Session, email: str, ip: str | None) -> None:
    s = get_settings()
    espera = _segundos_bloqueo(
        db, IntentoLogin.email, email, s.login_max_intentos_email, s.login_ventana_segundos
    )
    if ip:
        espera = max(
            espera,
            _segundos_bloqueo(
                db, IntentoLogin.ip, ip, s.login_max_intentos_ip, s.login_ventana_segundos
            ),
        )
    if espera:
        raise DemasiadosIntentos(espera)


# --- Emisión de tokens ----------------------------------------------------------------------


def _emitir_refresh(
    db: Session,
    usuario: Usuario,
    familia_id: uuid.UUID,
    ip: str | None,
    user_agent: str | None,
) -> tuple[RefreshToken, str]:
    token = generar_refresh_token()
    fila = RefreshToken(
        id=uuid.uuid4(),
        usuario_id=usuario.id,
        familia_id=familia_id,
        token_hash=hash_token(token),
        expira_en=_ahora() + timedelta(days=get_settings().refresh_token_dias),
        ip=ip,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(fila)
    return fila, token


def _sesion(usuario: Usuario, refresh_token: str) -> Sesion:
    acceso = crear_access_token(usuario.id, usuario.rol.value)
    return Sesion(
        usuario=usuario,
        access_token=acceso.token,
        refresh_token=refresh_token,
        expires_in=acceso.expira_en_segundos,
    )


def _revocar_familia(db: Session, familia_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.familia_id == familia_id, RefreshToken.revocado_en.is_(None))
        .values(revocado_en=_ahora())
    )


# --- Casos de uso ---------------------------------------------------------------------------


def login(db: Session, email: str, password: str, ip: str | None, user_agent: str | None) -> Sesion:
    email = normalizar_email(email)
    _verificar_limite(db, email, ip)

    usuario = db.scalar(select(Usuario).where(func.lower(Usuario.email) == email))
    valido = verificar_password(usuario.password_hash if usuario else None, password)

    if usuario is None or not valido or not usuario.activo:
        db.add(IntentoLogin(email=email, ip=ip, exitoso=False))
        registrar(
            db,
            accion="login_fallido",
            entidad="usuario",
            entidad_id=usuario.id if usuario else None,
            usuario_id=usuario.id if usuario else None,
            datos={"email": email, "motivo": "inactivo" if usuario and valido else "credenciales"},
            ip=ip,
        )
        db.commit()
        raise CredencialesInvalidas()

    if necesita_rehash(usuario.password_hash):
        usuario.password_hash = hash_password(password)

    db.add(IntentoLogin(email=email, ip=ip, exitoso=True))
    _, token = _emitir_refresh(db, usuario, uuid.uuid4(), ip, user_agent)
    registrar(
        db, accion="login", entidad="usuario", entidad_id=usuario.id, usuario_id=usuario.id, ip=ip
    )
    db.commit()
    return _sesion(usuario, token)


def refrescar(db: Session, refresh_token: str, ip: str | None, user_agent: str | None) -> Sesion:
    fila = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(refresh_token))
        .with_for_update()
    )
    if fila is None:
        raise RefreshInvalido()

    if fila.revocado_en is not None:
        # Reutilización de un token ya rotado o revocado: posible robo. Se corta toda la sesión.
        _revocar_familia(db, fila.familia_id)
        registrar(
            db,
            accion="refresh_reutilizado",
            entidad="sesion",
            entidad_id=fila.familia_id,
            usuario_id=fila.usuario_id,
            ip=ip,
        )
        db.commit()
        raise RefreshInvalido()

    usuario = db.get(Usuario, fila.usuario_id)
    if fila.expira_en <= _ahora() or usuario is None or not usuario.activo:
        _revocar_familia(db, fila.familia_id)
        db.commit()
        raise RefreshInvalido()

    nueva, token = _emitir_refresh(db, usuario, fila.familia_id, ip, user_agent)
    db.flush()  # la nueva fila debe existir antes de que la antigua la referencie
    fila.revocado_en = _ahora()
    fila.reemplazado_por = nueva.id
    db.commit()
    return _sesion(usuario, token)


def logout(db: Session, refresh_token: str, ip: str | None) -> None:
    """Revoca la sesión (toda la familia del token). Es idempotente."""
    fila = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if fila is None:
        return
    _revocar_familia(db, fila.familia_id)
    registrar(
        db,
        accion="logout",
        entidad="sesion",
        entidad_id=fila.familia_id,
        usuario_id=fila.usuario_id,
        ip=ip,
    )
    db.commit()
