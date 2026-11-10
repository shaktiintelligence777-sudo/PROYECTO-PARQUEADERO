"""B-03 · access token, /auth/me, roles y token de servicio."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from fastapi import Depends, FastAPI
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import obtener_ajustes
from app.core.dependencias import requiere_rol, requiere_token_servicio
from app.core.seguridad import crear_access_token
from app.db.tipos import Rol
from app.modules.auth.models import Usuario
from tests.auth.conftest import bearer

Login = Callable[..., Awaitable[Response]]


async def test_ca7_me_con_token_valido(
    cliente: AsyncClient, cabeceras_operador: dict[str, str], usuario_operador: Usuario
) -> None:
    r = await cliente.get("/auth/me", headers=cabeceras_operador)
    assert r.status_code == 200
    assert r.json()["email"] == usuario_operador.email


async def test_ca8_sin_cabecera_no_autenticado(cliente: AsyncClient) -> None:
    r = await cliente.get("/auth/me")
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "no_autenticado"


def _token_alterado(usuario: Usuario) -> str:
    cabecera, cuerpo, firma = crear_access_token(usuario.id, "operador").token.split(".")
    return f"{cabecera}.{cuerpo}.{firma[:-4]}AAAA"


def _token_alg_none(usuario: Usuario) -> str:
    ahora = datetime.now(UTC)
    payload = {
        "sub": str(usuario.id),
        "rol": "admin",
        "iat": int(ahora.timestamp()),
        "exp": int((ahora + timedelta(minutes=5)).timestamp()),
        "jti": "x",
    }
    return jwt.encode(payload, key=None, algorithm="none")


def _token_otra_firma(usuario: Usuario) -> str:
    ahora = datetime.now(UTC)
    payload = {
        "sub": str(usuario.id),
        "iat": int(ahora.timestamp()),
        "exp": int((ahora + timedelta(minutes=5)).timestamp()),
        "jti": "x",
    }
    return jwt.encode(payload, "otro-secreto-de-al-menos-32-caracteres!!", algorithm="HS256")


@pytest.mark.parametrize("fabricar", [_token_alterado, _token_alg_none, _token_otra_firma])
async def test_ca8_token_alterado_o_sin_firma(
    cliente: AsyncClient, usuario_operador: Usuario, fabricar: Callable[[Usuario], str]
) -> None:
    r = await cliente.get("/auth/me", headers=bearer(fabricar(usuario_operador)))
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


async def test_ca8_token_vencido(
    cliente: AsyncClient,
    usuario_operador: Usuario,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    t0 = datetime.now(UTC)
    reloj_fijo(t0)
    token = crear_access_token(usuario_operador.id, "operador").token
    reloj_fijo(t0 + timedelta(minutes=15, seconds=1))
    r = await cliente.get("/auth/me", headers=bearer(token))
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


async def test_refresh_token_no_sirve_como_access(
    cliente: AsyncClient, crear_usuario: Callable[..., Any], login: Login
) -> None:
    await crear_usuario(email="ana@parqueadero.app")
    refresh = (await login("ana@parqueadero.app")).json()["refresh_token"]
    assert (await cliente.get("/auth/me", headers=bearer(refresh))).status_code == 401


async def test_ca13_usuario_desactivado_pierde_acceso_y_refresh(
    sesion: AsyncSession,
    cliente: AsyncClient,
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Callable[[str], Awaitable[Response]],
) -> None:
    u = await crear_usuario(email="ana@parqueadero.app")
    tokens = (await login("ana@parqueadero.app")).json()
    u.activo = False
    await sesion.flush()
    r = await cliente.get("/auth/me", headers=bearer(tokens["access_token"]))
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"
    r = await refrescar(tokens["refresh_token"])
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"


@pytest.fixture
def rutas_protegidas(app: FastAPI) -> None:
    @app.get("/api/v1/prueba/solo-admin", dependencies=[Depends(requiere_rol("admin"))])
    async def solo_admin() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/v1/prueba/interno", dependencies=[Depends(requiere_token_servicio)])
    async def interno() -> dict[str, bool]:
        return {"ok": True}


async def test_ca14_requiere_rol(
    rutas_protegidas: None,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    cabeceras_operador: dict[str, str],
) -> None:
    r = await cliente.get("/prueba/solo-admin", headers=cabeceras_operador)
    assert r.status_code == 403
    assert r.json()["error"] == {
        "codigo": "sin_permiso",
        "mensaje": "No tienes permiso para hacer esto.",
    }
    assert (await cliente.get("/prueba/solo-admin", headers=cabeceras_admin)).status_code == 200


async def test_rol_se_lee_de_la_bd_y_no_del_token(
    rutas_protegidas: None, cliente: AsyncClient, usuario_operador: Usuario
) -> None:
    token = crear_access_token(usuario_operador.id, Rol.ADMIN.value).token
    assert (await cliente.get("/prueba/solo-admin", headers=bearer(token))).status_code == 403


async def test_ca15_token_de_servicio(
    rutas_protegidas: None, cliente: AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    servicio = obtener_ajustes().service_token
    assert (await cliente.post("/prueba/interno", headers=bearer(servicio))).status_code == 200
    r = await cliente.post("/prueba/interno", headers=cabeceras_admin)
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "token_invalido"
    r = await cliente.post("/prueba/interno", headers=bearer("x" * 40))
    assert r.status_code == 401
