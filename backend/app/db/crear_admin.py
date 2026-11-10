"""Crea el primer administrador (B-09). Es la única forma de crear el primer usuario.

    python -m app.db.crear_admin --email dueno@ejemplo.com --nombre "Nombre Apellido"

La contraseña se pide por entrada oculta (dos veces) y nunca se pasa por argumentos ni por
variables de entorno. Es idempotente por email: si ya existe un usuario con ese email, no lo
modifica y lo indica.
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.auditoria import registrar_auditoria
from app.core.seguridad import hash_password
from app.db.tipos import Rol
from app.modules.auth.models import Usuario

LONGITUD_MINIMA = 12
LONGITUD_MAXIMA = 128

_email = TypeAdapter(EmailStr)


class DatoInvalido(ValueError):
    pass


@dataclass(frozen=True)
class Resultado:
    usuario: Usuario
    creado: bool


def validar_email(email: str) -> str:
    try:
        return _email.validate_python(email.strip()).lower()
    except ValidationError as exc:
        raise DatoInvalido("El email no es válido.") from exc


def validar_nombre(nombre: str) -> str:
    nombre = nombre.strip()
    if not 1 <= len(nombre) <= 120:
        raise DatoInvalido("El nombre debe tener entre 1 y 120 caracteres.")
    return nombre


def validar_password(password: str) -> str:
    if len(password) < LONGITUD_MINIMA:
        raise DatoInvalido(f"La contraseña debe tener al menos {LONGITUD_MINIMA} caracteres.")
    if len(password) > LONGITUD_MAXIMA:
        raise DatoInvalido(f"La contraseña debe tener como máximo {LONGITUD_MAXIMA} caracteres.")
    return password


async def buscar(sesion: AsyncSession, email: str) -> Usuario | None:
    return await sesion.scalar(select(Usuario).where(func.lower(Usuario.email) == email.lower()))


async def crear_admin(sesion: AsyncSession, email: str, nombre: str, password: str) -> Resultado:
    """Crea un admin activo con hash Argon2id. Si el email ya existe, no cambia nada."""
    email = validar_email(email)
    existente = await buscar(sesion, email)
    if existente is not None:
        return Resultado(existente, creado=False)
    usuario = Usuario(
        email=email,
        password_hash=hash_password(validar_password(password)),
        nombre=validar_nombre(nombre),
        rol=Rol.ADMIN,
        activo=True,
    )
    sesion.add(usuario)
    await sesion.flush()
    await registrar_auditoria(
        sesion,
        usuario_id=None,
        accion="usuario.crear_admin",
        entidad="usuario",
        entidad_id=usuario.id,
        datos={"email": email, "nombre": usuario.nombre, "origen": "crear_admin"},
    )
    await sesion.commit()
    return Resultado(usuario, creado=True)


def pedir_password(leer: Callable[[str], str] = getpass.getpass) -> str:
    password = validar_password(leer("Contraseña (mínimo 12 caracteres): "))
    if leer("Repite la contraseña: ") != password:
        raise DatoInvalido("Las contraseñas no coinciden.")
    return password


async def ejecutar(
    fabrica: async_sessionmaker[AsyncSession],
    email: str,
    nombre: str,
    leer: Callable[[str], str] = getpass.getpass,
) -> Resultado:
    email = validar_email(email)
    nombre = validar_nombre(nombre)
    async with fabrica() as sesion:
        existente = await buscar(sesion, email)
        if existente is not None:
            return Resultado(existente, creado=False)
        return await crear_admin(sesion, email, nombre, pedir_password(leer))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Crea el primer administrador.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--nombre", required=True)
    args = parser.parse_args(argv)

    from app.db.sesion import obtener_fabrica_sesiones, obtener_motor

    async def _correr() -> Resultado:
        try:
            return await ejecutar(obtener_fabrica_sesiones(), args.email, args.nombre)
        finally:
            await obtener_motor().dispose()

    try:
        resultado = asyncio.run(_correr())
    except DatoInvalido as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if resultado.creado:
        print(f"Administrador creado: {resultado.usuario.email}")
    else:
        print(f"Ya existe un usuario con el email {resultado.usuario.email}; no se modificó.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
