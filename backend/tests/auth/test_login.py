"""B-03 · login y límite de intentos."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tipos import Rol
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import IntentoLogin
from tests.conftest import PASSWORD

Login = Callable[..., Awaitable[Response]]
T0 = datetime(2026, 11, 10, 15, 0, tzinfo=UTC)


async def test_ca1_login_correcto(crear_usuario: Callable[..., Any], login: Login) -> None:
    u = await crear_usuario(email="ana@parqueadero.app", rol=Rol.ADMIN)
    r = await login("ana@parqueadero.app")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["expires_in"] == 900
    assert cuerpo["access_token"] and len(cuerpo["refresh_token"]) >= 20
    usuario = cuerpo["usuario"]
    assert set(usuario) == {"id", "email", "nombre", "rol", "activo", "creado_en"}
    assert usuario["id"] == str(u.id)
    assert usuario["rol"] == "admin"
    assert usuario["creado_en"].endswith("Z")
    assert "password" not in r.text
    assert r.headers["Cache-Control"] == "no-store"


async def test_ca2_email_con_mayusculas_y_espacios(
    crear_usuario: Callable[..., Any], login: Login
) -> None:
    await crear_usuario(email="demo@parqueadero.app")
    assert (await login(" Demo@Parqueadero.app ")).status_code == 200


@pytest.mark.parametrize("caso", ["password_incorrecta", "email_inexistente", "inactivo"])
async def test_ca3_fallos_responden_igual(
    caso: str, crear_usuario: Callable[..., Any], login: Login
) -> None:
    await crear_usuario(email="ana@parqueadero.app", activo=caso != "inactivo")
    email = "nadie@parqueadero.app" if caso == "email_inexistente" else "ana@parqueadero.app"
    password = "otra-clave" if caso == "password_incorrecta" else PASSWORD
    r = await login(email, password)
    assert r.status_code == 401
    assert r.json() == {
        "error": {"codigo": "credenciales_invalidas", "mensaje": "Email o contraseña incorrectos."}
    }


async def test_ca4_bloqueo_tras_cinco_fallos_por_email(
    crear_usuario: Callable[..., Any], login: Login, reloj_fijo: Callable[[datetime], None]
) -> None:
    reloj_fijo(T0)
    await crear_usuario(email="ana@parqueadero.app")
    for _ in range(5):
        assert (await login("ana@parqueadero.app", "mala-clave")).status_code == 401
    r = await login("ana@parqueadero.app")  # aunque la contraseña sea correcta
    assert r.status_code == 429
    assert r.json()["error"]["codigo"] == "demasiados_intentos"
    assert 0 < int(r.headers["Retry-After"]) <= 15 * 60


async def test_ca5_el_bloqueo_expira_a_los_15_minutos(
    crear_usuario: Callable[..., Any], login: Login, reloj_fijo: Callable[[datetime], None]
) -> None:
    reloj_fijo(T0)
    await crear_usuario(email="ana@parqueadero.app")
    for _ in range(5):
        await login("ana@parqueadero.app", "mala-clave")
    assert (await login("ana@parqueadero.app")).status_code == 429
    reloj_fijo(T0 + timedelta(minutes=16))
    assert (await login("ana@parqueadero.app")).status_code == 200


async def test_ca6_bloqueo_por_ip(
    crear_usuario: Callable[..., Any], login: Login, reloj_fijo: Callable[[datetime], None]
) -> None:
    reloj_fijo(T0)
    await crear_usuario(email="ana@parqueadero.app")
    for i in range(20):
        await login(f"otro{i}@parqueadero.app", "mala-clave")
    r = await login("ana@parqueadero.app")
    assert r.status_code == 429
    assert "Retry-After" in r.headers


async def test_acierto_reinicia_el_conteo_del_email(
    crear_usuario: Callable[..., Any], login: Login, reloj_fijo: Callable[[datetime], None]
) -> None:
    reloj_fijo(T0)
    await crear_usuario(email="ana@parqueadero.app")
    for _ in range(4):
        await login("ana@parqueadero.app", "mala-clave")
    reloj_fijo(T0 + timedelta(seconds=1))
    assert (await login("ana@parqueadero.app")).status_code == 200
    reloj_fijo(T0 + timedelta(seconds=2))
    for _ in range(4):
        assert (await login("ana@parqueadero.app", "mala-clave")).status_code == 401
    assert (await login("ana@parqueadero.app")).status_code == 200


async def test_ca17_auditoria_de_login_sin_secretos(
    sesion: AsyncSession, crear_usuario: Callable[..., Any], login: Login
) -> None:
    u = await crear_usuario(email="ana@parqueadero.app")
    await login("ana@parqueadero.app", "clave-equivocada")
    ok = (await login("ana@parqueadero.app")).json()
    filas = (
        await sesion.scalars(
            select(Auditoria).where(Auditoria.usuario_id == u.id).order_by(Auditoria.id)
        )
    ).all()
    assert [f.accion for f in filas] == ["auth.login_fallido", "auth.login"]
    assert filas[0].datos == {"email": "ana@parqueadero.app"}
    for f in filas:
        texto = str(f.datos)
        for secreto in ("clave-equivocada", PASSWORD, ok["access_token"], ok["refresh_token"]):
            assert secreto not in texto


async def test_intentos_quedan_registrados(
    sesion: AsyncSession, crear_usuario: Callable[..., Any], login: Login
) -> None:
    await crear_usuario(email="ana@parqueadero.app")
    await login("ana@parqueadero.app", "mala-clave")
    intento = await sesion.scalar(select(IntentoLogin))
    assert intento is not None
    assert (intento.email, str(intento.ip), intento.exitoso) == (
        "ana@parqueadero.app",
        "127.0.0.1",
        False,
    )


async def test_cuerpo_invalido_es_422(login: Login) -> None:
    r = await login("no-es-un-email", "x")
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "email"
