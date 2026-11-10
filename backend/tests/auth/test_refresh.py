"""B-03 · refresh rotativo, reutilización, vencimiento y logout."""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from httpx import AsyncClient, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.seguridad import hash_password, hash_token
from app.db.tipos import Rol
from app.main import crear_app
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import RefreshToken, Usuario
from tests.conftest import PASSWORD

Login = Callable[..., Awaitable[Response]]
Refrescar = Callable[[str], Awaitable[Response]]


async def _sesion_nueva(crear_usuario: Callable[..., Any], login: Login) -> dict[str, Any]:
    await crear_usuario(email="ana@parqueadero.app")
    datos: dict[str, Any] = (await login("ana@parqueadero.app")).json()
    return datos


async def test_ca9_refresh_rota_el_par(
    cliente: AsyncClient,
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Refrescar,
) -> None:
    t1 = (await _sesion_nueva(crear_usuario, login))["refresh_token"]
    r = await refrescar(t1)
    assert r.status_code == 200
    nuevo = r.json()
    assert nuevo["refresh_token"] != t1
    assert nuevo["expires_in"] == 900
    me = await cliente.get("/auth/me", headers={"Authorization": f"Bearer {nuevo['access_token']}"})
    assert me.status_code == 200
    assert (await refrescar(nuevo["refresh_token"])).status_code == 200


async def test_ca9_el_refresh_anterior_deja_de_servir(
    crear_usuario: Callable[..., Any], login: Login, refrescar: Refrescar
) -> None:
    t1 = (await _sesion_nueva(crear_usuario, login))["refresh_token"]
    await refrescar(t1)
    r = await refrescar(t1)
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


async def test_ca10_reutilizar_revoca_todas_las_sesiones(
    sesion: AsyncSession,
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Refrescar,
) -> None:
    await crear_usuario(email="ana@parqueadero.app")
    celular = (await login("ana@parqueadero.app")).json()["refresh_token"]
    computador = (await login("ana@parqueadero.app")).json()["refresh_token"]
    celular_2 = (await refrescar(celular)).json()["refresh_token"]

    assert (await refrescar(celular)).status_code == 401  # reutilización (CB-14)
    assert (await refrescar(celular_2)).status_code == 401  # el más reciente cae
    assert (await refrescar(computador)).status_code == 401  # y las demás sesiones también
    total = await sesion.scalar(
        select(func.count()).where(Auditoria.accion == "auth.refresh_reutilizado")
    )
    assert total == 1


async def test_ca11_refresh_de_mas_de_30_dias(
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Refrescar,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    t0 = datetime.now(UTC)
    reloj_fijo(t0)
    t = (await _sesion_nueva(crear_usuario, login))["refresh_token"]
    reloj_fijo(t0 + timedelta(days=30, seconds=1))
    r = await refrescar(t)
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


async def test_refresh_desconocido(refrescar: Refrescar) -> None:
    r = await refrescar("x" * 43)
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


async def test_ca12_logout_revoca_y_es_idempotente(
    cliente: AsyncClient,
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Refrescar,
) -> None:
    t = (await _sesion_nueva(crear_usuario, login))["refresh_token"]
    assert (await cliente.post("/auth/logout", json={"refresh_token": t})).status_code == 204
    assert (await refrescar(t)).status_code == 401
    assert (await cliente.post("/auth/logout", json={"refresh_token": t})).status_code == 204
    otro = await cliente.post("/auth/logout", json={"refresh_token": "y" * 43})
    assert otro.status_code == 204


async def test_ca18_solo_se_guarda_el_hash(
    sesion: AsyncSession, crear_usuario: Callable[..., Any], login: Login
) -> None:
    t = (await _sesion_nueva(crear_usuario, login))["refresh_token"]
    hashes = (await sesion.scalars(select(RefreshToken.token_hash))).all()
    assert hashes == [hash_token(t)]
    assert t not in hashes


async def test_ca19_dos_refresh_simultaneos_como_mucho_uno_gana(motor: AsyncEngine) -> None:
    """Usa transacciones reales (no la transacción revertida de las demás pruebas) para que
    el bloqueo de fila actúe entre dos conexiones distintas."""
    email = f"concurrente-{uuid.uuid4().hex[:8]}@parqueadero.app"
    async with AsyncSession(motor) as s:
        s.add(
            Usuario(
                email=email,
                password_hash=hash_password(PASSWORD),
                nombre="Concurrente",
                rol=Rol.OPERADOR,
            )
        )
        await s.commit()
    try:
        app = crear_app()
        transporte = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transporte, base_url="http://t/api/v1") as c:
            r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
            token = r.json()["refresh_token"]
            respuestas = await asyncio.gather(
                *(c.post("/auth/refresh", json={"refresh_token": token}) for _ in range(2))
            )
        codigos = sorted(r.status_code for r in respuestas)
        assert codigos == [200, 401]
    finally:
        async with motor.begin() as conexion:
            await conexion.execute(
                text(
                    "TRUNCATE usuarios, refresh_tokens, intentos_login, auditoria "
                    "RESTART IDENTITY CASCADE"
                )
            )
        from app.db.sesion import obtener_motor

        await obtener_motor().dispose()
