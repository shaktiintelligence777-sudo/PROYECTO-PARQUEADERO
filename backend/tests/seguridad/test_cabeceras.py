"""C-03 · CA-4: cabeceras de seguridad en las respuestas autenticadas."""

import httpx
import pytest

from tests.seguridad.contrato import Operacion, construidas

CON_BEARER = [op for op in construidas() if "bearerAuth" in op.esquemas]
ESPERADAS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
}


def _comprobar(r: httpx.Response, op: object) -> None:
    for cabecera, valor in ESPERADAS.items():
        assert r.headers.get(cabecera) == valor, f"{op}: {cabecera}={r.headers.get(cabecera)!r}"


@pytest.mark.parametrize("op", CON_BEARER, ids=lambda op: op.id)
async def test_ca4_respuesta_autenticada_lleva_las_tres_cabeceras(
    cliente: httpx.AsyncClient, cabeceras_admin: dict[str, str], op: Operacion
) -> None:
    cuerpo = {} if op.metodo in ("post", "put", "patch") else None
    r = await cliente.request(op.metodo, op.url_de_prueba(), json=cuerpo, headers=cabeceras_admin)
    _comprobar(r, op)


async def test_ca4_respuesta_correcta_con_datos(
    cliente: httpx.AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    r = await cliente.get("/clientes", headers=cabeceras_admin)
    assert r.status_code == 200
    _comprobar(r, "GET /clientes")


async def test_ca4_rechazos_de_autenticacion_tampoco_se_guardan(
    cliente: httpx.AsyncClient,
) -> None:
    r = await cliente.get("/auth/me", headers={"Authorization": "Bearer x"})
    assert r.status_code == 401
    _comprobar(r, "GET /auth/me con token inválido")


async def test_ca4_login_y_refresh_no_se_guardan(
    cliente: httpx.AsyncClient, usuario_admin: object
) -> None:
    from tests.conftest import PASSWORD

    r = await cliente.post(
        "/auth/login", json={"email": "admin@parqueadero.app", "password": PASSWORD}
    )
    assert r.status_code == 200
    _comprobar(r, "POST /auth/login")
    r = await cliente.post("/auth/refresh", json={"refresh_token": r.json()["refresh_token"]})
    assert r.status_code == 200
    _comprobar(r, "POST /auth/refresh")


async def test_ca4_errores_internos_tambien_las_llevan(
    cliente: httpx.AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    """El 500 lo produce el manejador global; las cabeceras no deben perderse por el camino."""
    from unittest.mock import patch

    with patch("app.modules.clientes.service.listar", side_effect=RuntimeError("boom")):
        r = await cliente.get("/clientes", headers=cabeceras_admin)
    assert r.status_code == 500
    assert "boom" not in r.text
    _comprobar(r, "500")
