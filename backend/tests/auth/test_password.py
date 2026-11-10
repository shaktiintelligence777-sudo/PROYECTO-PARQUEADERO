"""B-03 · cambio de contraseña y almacenamiento."""

from collections.abc import Awaitable, Callable
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auditoria.models import Auditoria
from tests.auth.conftest import bearer
from tests.conftest import PASSWORD

Login = Callable[..., Awaitable[Response]]


async def test_ca16_cambio_de_password(
    sesion: AsyncSession,
    cliente: AsyncClient,
    crear_usuario: Callable[..., Any],
    login: Login,
    refrescar: Callable[[str], Awaitable[Response]],
) -> None:
    u = await crear_usuario(email="ana@parqueadero.app")
    tokens = (await login("ana@parqueadero.app")).json()
    r = await cliente.put(
        "/auth/password",
        headers=bearer(tokens["access_token"]),
        json={"password_actual": PASSWORD, "password_nueva": "una-clave-nueva"},
    )
    assert r.status_code == 204
    assert (await refrescar(tokens["refresh_token"])).status_code == 401
    assert (await login("ana@parqueadero.app")).status_code == 401
    assert (await login("ana@parqueadero.app", "una-clave-nueva")).status_code == 200
    acciones = (
        await sesion.scalars(select(Auditoria.accion).where(Auditoria.usuario_id == u.id))
    ).all()
    assert "auth.cambio_password" in acciones


async def test_ca16_password_actual_incorrecta(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    r = await cliente.put(
        "/auth/password",
        headers=cabeceras_operador,
        json={"password_actual": "no-es-esta", "password_nueva": "una-clave-nueva"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["codigo"] == "password_incorrecta"


async def test_password_nueva_minimo_8(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    r = await cliente.put(
        "/auth/password",
        headers=cabeceras_operador,
        json={"password_actual": PASSWORD, "password_nueva": "corta"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "password_nueva"


async def test_password_requiere_sesion(cliente: AsyncClient) -> None:
    r = await cliente.put(
        "/auth/password", json={"password_actual": "a", "password_nueva": "12345678"}
    )
    assert r.status_code == 401


async def test_password_con_argon2id(crear_usuario: Callable[..., Any]) -> None:
    u = await crear_usuario()
    assert u.password_hash.startswith("$argon2id$")
    assert PASSWORD not in u.password_hash
