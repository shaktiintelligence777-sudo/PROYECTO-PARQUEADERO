"""Autenticación: login con límite de intentos, refresh rotativo, logout y cambio de contraseña."""

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.config import obtener_ajustes
from app.core.errores import ErrorApi
from app.core.seguridad import (
    crear_access_token,
    generar_refresh_token,
    hash_password,
    hash_token,
    necesita_rehash,
    verificar_password,
)
from app.modules.auth.models import IntentoLogin, RefreshToken, Usuario


@dataclass(frozen=True)
class SesionEmitida:
    usuario: Usuario
    access_token: str
    refresh_token: str
    expires_in: int


def _token_invalido() -> ErrorApi:
    return ErrorApi("token_invalido", status=401)


# --- Límite de intentos (RN-75) -----------------------------------------------------------


async def _segundos_bloqueo(
    sesion: AsyncSession, filtro: ColumnElement[bool], maximo: int, ventana: timedelta
) -> int:
    """Si hay `maximo` fallos o más en la ventana, segundos hasta que el más antiguo de los
    últimos `maximo` salga de ella; si no, 0."""
    ahora = reloj.ahora()
    ultimos = (
        select(IntentoLogin.creado_en)
        .where(filtro, IntentoLogin.exitoso.is_(False), IntentoLogin.creado_en > ahora - ventana)
        .order_by(IntentoLogin.creado_en.desc())
        .limit(maximo)
        .subquery()
    )
    fila = (await sesion.execute(select(func.count(), func.min(ultimos.c.creado_en)))).one()
    total: int = fila[0]
    mas_antiguo: datetime | None = fila[1]
    if total < maximo or mas_antiguo is None:
        return 0
    return max(1, math.ceil((mas_antiguo + ventana - ahora).total_seconds()))


async def _verificar_limite(sesion: AsyncSession, email: str, ip: str) -> None:
    ajustes = obtener_ajustes()
    ventana = timedelta(minutes=ajustes.login_ventana_minutos)

    # Para el email solo cuentan los fallos posteriores a su último acierto.
    ultimo_acierto = (
        select(func.max(IntentoLogin.creado_en))
        .where(IntentoLogin.email == email, IntentoLogin.exitoso.is_(True))
        .scalar_subquery()
    )
    filtro_email = (IntentoLogin.email == email) & (
        (ultimo_acierto.is_(None)) | (IntentoLogin.creado_en > ultimo_acierto)
    )
    espera = max(
        await _segundos_bloqueo(sesion, filtro_email, ajustes.login_max_fallos_email, ventana),
        await _segundos_bloqueo(
            sesion, IntentoLogin.ip == ip, ajustes.login_max_fallos_ip, ventana
        ),
    )
    if espera:
        raise ErrorApi("demasiados_intentos", status=429, cabeceras={"Retry-After": str(espera)})


# --- Tokens -------------------------------------------------------------------------------


def _nuevo_refresh(usuario_id: uuid.UUID, familia_id: uuid.UUID) -> tuple[RefreshToken, str]:
    token = generar_refresh_token()
    ahora = reloj.ahora()
    fila = RefreshToken(
        usuario_id=usuario_id,
        familia_id=familia_id,
        token_hash=hash_token(token),
        expira_en=ahora + timedelta(days=obtener_ajustes().refresh_dias),
        creado_en=ahora,
    )
    return fila, token


def _emitir(usuario: Usuario, refresh_token: str) -> SesionEmitida:
    acceso = crear_access_token(usuario.id, usuario.rol.value)
    return SesionEmitida(
        usuario=usuario,
        access_token=acceso.token,
        refresh_token=refresh_token,
        expires_in=acceso.expira_en_segundos,
    )


async def revocar_todas_las_sesiones(sesion: AsyncSession, usuario_id: uuid.UUID) -> None:
    await sesion.execute(
        update(RefreshToken)
        .where(RefreshToken.usuario_id == usuario_id, RefreshToken.revocado_en.is_(None))
        .values(revocado_en=reloj.ahora())
    )


# --- Casos de uso -------------------------------------------------------------------------


async def login(sesion: AsyncSession, email: str, password: str, ip: str) -> SesionEmitida:
    email = email.strip().lower()
    await _verificar_limite(sesion, email, ip)

    usuario = await sesion.scalar(select(Usuario).where(func.lower(Usuario.email) == email))
    valida = verificar_password(usuario.password_hash if usuario else None, password)

    if usuario is None or not valida or not usuario.activo:
        sesion.add(IntentoLogin(email=email, ip=ip, exitoso=False, creado_en=reloj.ahora()))
        await registrar_auditoria(
            sesion,
            usuario_id=usuario.id if usuario else None,
            accion="auth.login_fallido",
            entidad="usuario",
            entidad_id=usuario.id if usuario else None,
            datos={"email": email},
            ip=ip,
        )
        await sesion.commit()
        raise ErrorApi("credenciales_invalidas", status=401)

    if necesita_rehash(usuario.password_hash):
        usuario.password_hash = hash_password(password)

    sesion.add(IntentoLogin(email=email, ip=ip, exitoso=True, creado_en=reloj.ahora()))
    fila, token = _nuevo_refresh(usuario.id, uuid.uuid4())
    sesion.add(fila)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="auth.login",
        entidad="usuario",
        entidad_id=usuario.id,
        ip=ip,
    )
    await sesion.commit()
    return _emitir(usuario, token)


async def refrescar(sesion: AsyncSession, refresh_token: str, ip: str) -> SesionEmitida:
    # FOR UPDATE: dos peticiones simultáneas con el mismo token se serializan y solo una rota.
    fila = await sesion.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(refresh_token))
        .with_for_update()
    )
    if fila is None:
        raise _token_invalido()

    if fila.usado_en is not None:
        # CB-14: reutilización de un token ya rotado. Se cortan todas las sesiones del usuario.
        await revocar_todas_las_sesiones(sesion, fila.usuario_id)
        await registrar_auditoria(
            sesion,
            usuario_id=fila.usuario_id,
            accion="auth.refresh_reutilizado",
            entidad="usuario",
            entidad_id=fila.usuario_id,
            datos={"familia_id": str(fila.familia_id)},
            ip=ip,
        )
        await sesion.commit()
        raise _token_invalido()

    usuario = await sesion.get(Usuario, fila.usuario_id)
    if (
        fila.revocado_en is not None
        or fila.expira_en <= reloj.ahora()
        or usuario is None
        or not usuario.activo
    ):
        await sesion.rollback()
        raise _token_invalido()

    fila.usado_en = reloj.ahora()
    nueva, token = _nuevo_refresh(usuario.id, fila.familia_id)
    sesion.add(nueva)
    await sesion.commit()
    return _emitir(usuario, token)


async def logout(sesion: AsyncSession, refresh_token: str, ip: str) -> None:
    """Revoca el refresh token recibido. Idempotente."""
    fila = await sesion.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if fila is None or fila.revocado_en is not None:
        return
    fila.revocado_en = reloj.ahora()
    await registrar_auditoria(
        sesion,
        usuario_id=fila.usuario_id,
        accion="auth.logout",
        entidad="usuario",
        entidad_id=fila.usuario_id,
        ip=ip,
    )
    await sesion.commit()


async def cambiar_password(
    sesion: AsyncSession, usuario: Usuario, actual: str, nueva: str, ip: str
) -> None:
    if not verificar_password(usuario.password_hash, actual):
        raise ErrorApi("password_incorrecta", status=400)
    usuario.password_hash = hash_password(nueva)
    await revocar_todas_las_sesiones(sesion, usuario.id)
    await registrar_auditoria(
        sesion,
        usuario_id=usuario.id,
        accion="auth.cambio_password",
        entidad="usuario",
        entidad_id=usuario.id,
        ip=ip,
    )
    await sesion.commit()
