"""B-09 · CA-6: comando `crear_admin`."""

from collections.abc import Callable, Iterator

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.seguridad import verificar_password
from app.db import crear_admin as comando
from app.db.tipos import Rol
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario

PASSWORD = "una-clave-larga-123"


class _Fabrica:
    """Hace pasar la sesión de la prueba (transacción revertida) por una fábrica."""

    def __init__(self, sesion: AsyncSession) -> None:
        self.sesion = sesion

    def __call__(self) -> "_Fabrica":
        return self

    async def __aenter__(self) -> AsyncSession:
        return self.sesion

    async def __aexit__(self, *_: object) -> None:
        return None


def _leer(respuestas: Iterator[str]) -> Callable[[str], str]:
    return lambda _mensaje: next(respuestas)


async def _ejecutar(sesion: AsyncSession, email: str, *claves: str) -> comando.Resultado:
    fabrica: async_sessionmaker[AsyncSession] = _Fabrica(sesion)  # type: ignore[assignment]
    return await comando.ejecutar(fabrica, email, "Dueño del parqueadero", _leer(iter(claves)))


async def test_ca6_crea_admin_activo_con_argon2id(sesion: AsyncSession) -> None:
    resultado = await _ejecutar(sesion, "  Dueno@Ejemplo.com ", PASSWORD, PASSWORD)
    assert resultado.creado is True
    usuario = resultado.usuario
    assert usuario.email == "dueno@ejemplo.com"
    assert usuario.rol == Rol.ADMIN and usuario.activo is True
    assert usuario.password_hash.startswith("$argon2id$")
    assert verificar_password(usuario.password_hash, PASSWORD)
    fila = await sesion.scalar(select(Auditoria).where(Auditoria.entidad_id == usuario.id))
    assert fila is not None and fila.accion == "usuario.crear_admin"
    assert "password" not in str(fila.datos)


async def test_ca6_mismo_email_no_cambia_nada(sesion: AsyncSession) -> None:
    primero = await _ejecutar(sesion, "dueno@ejemplo.com", PASSWORD, PASSWORD)
    hash_original = primero.usuario.password_hash

    # Ni siquiera pide la contraseña: si la pidiera, el lector vacío fallaría.
    segundo = await _ejecutar(sesion, "DUENO@ejemplo.com")
    assert segundo.creado is False
    assert segundo.usuario.id == primero.usuario.id
    await sesion.refresh(segundo.usuario)
    assert segundo.usuario.password_hash == hash_original
    total = await sesion.scalar(select(func.count()).select_from(Usuario))
    assert total == 1


async def test_ca6_rechaza_contrasena_corta(sesion: AsyncSession) -> None:
    with pytest.raises(comando.DatoInvalido, match="al menos 12"):
        await _ejecutar(sesion, "dueno@ejemplo.com", "12345678", "12345678")
    assert await sesion.scalar(select(func.count()).select_from(Usuario)) == 0


async def test_rechaza_confirmacion_distinta_y_email_invalido(sesion: AsyncSession) -> None:
    with pytest.raises(comando.DatoInvalido, match="no coinciden"):
        await _ejecutar(sesion, "dueno@ejemplo.com", PASSWORD, PASSWORD + "x")
    with pytest.raises(comando.DatoInvalido, match="email"):
        await _ejecutar(sesion, "no-es-un-email", PASSWORD, PASSWORD)
    assert await sesion.scalar(select(func.count()).select_from(Usuario)) == 0


def test_main_informa_error_sin_tocar_la_base(capsys: pytest.CaptureFixture[str]) -> None:
    assert comando.main(["--email", "no-es-un-email", "--nombre", "Dueño"]) == 1
    assert "El email no es válido." in capsys.readouterr().err
