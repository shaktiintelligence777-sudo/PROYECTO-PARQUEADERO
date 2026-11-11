"""C-03 · Matriz de permisos generada desde `contracts/openapi.yaml` (CA-1, CA-2 y CA-3).

Cada operación del contrato se prueba sin token, con un token inválido y con el rol
insuficiente. Una operación nueva entra sola en la matriz; si no está protegida, CI falla.
"""

import ast
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from tests.conftest import cabeceras
from tests.seguridad.contrato import (
    PENDIENTES,
    Operacion,
    construidas,
    normalizar,
    operaciones,
)

DIR_APP = Path(__file__).resolve().parents[2] / "app"

CON_TOKEN = [op for op in construidas() if op.esquemas]
CON_BEARER = [op for op in construidas() if "bearerAuth" in op.esquemas]
SOLO_ADMIN = [op for op in construidas() if op.solo_admin]
TODOS_LOS_ROLES = [op for op in CON_BEARER if not op.roles]


def _ids(op: Operacion) -> str:
    return op.id


async def _llamar(
    cliente: httpx.AsyncClient, op: Operacion, cab: dict[str, str] | None = None
) -> httpx.Response:
    cuerpo = {} if op.metodo in ("post", "put", "patch") else None
    return await cliente.request(op.metodo, op.url_de_prueba(), json=cuerpo, headers=cab or {})


# --- Coherencia del propio contrato -------------------------------------------------------------


def test_contrato_coherente() -> None:
    ops = operaciones()
    assert len({op.id for op in ops}) == len(ops), "operationId repetido"
    for op in ops:
        assert set(op.esquemas) <= {"bearerAuth", "serviceToken"}, op
        assert op.roles in ((), ("admin",)), f"x-roles no previsto en {op}"
        assert not (op.roles and "bearerAuth" not in op.esquemas), f"x-roles sin bearer: {op}"
    publicas = {op.id for op in ops if not op.esquemas}
    assert publicas == {"salud", "login", "refrescarSesion", "logout"}
    internas = {op.id for op in ops if op.esquemas == ("serviceToken",)}
    assert internas == {"ejecutarJobNotificaciones"}
    assert {op.id for op in ops} >= set(PENDIENTES)


# --- CA-1 ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("op", CON_TOKEN, ids=_ids)
async def test_ca1_sin_token_responde_401(cliente: httpx.AsyncClient, op: Operacion) -> None:
    r = await _llamar(cliente, op)
    assert r.status_code == 401, f"{op}: {r.status_code} {r.text}"
    assert r.json()["error"]["codigo"] == "no_autenticado"
    assert r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("op", CON_TOKEN, ids=_ids)
async def test_ca1_token_invalido_responde_401(cliente: httpx.AsyncClient, op: Operacion) -> None:
    r = await _llamar(cliente, op, {"Authorization": "Bearer no-es-un-token"})
    assert r.status_code == 401, f"{op}: {r.status_code} {r.text}"
    assert r.json()["error"]["codigo"] == "token_invalido"


@pytest.mark.parametrize("op", CON_BEARER, ids=_ids)
async def test_ca1_token_de_servicio_no_sirve_como_jwt(
    cliente: httpx.AsyncClient, op: Operacion
) -> None:
    from app.core.config import obtener_ajustes

    servicio = {"Authorization": f"Bearer {obtener_ajustes().service_token}"}
    r = await _llamar(cliente, op, servicio)
    assert r.status_code == 401, f"{op}: {r.status_code} {r.text}"


async def test_ca1_jwt_de_usuario_no_sirve_en_rutas_internas(
    cliente: httpx.AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    internas = [op for op in construidas() if op.esquemas == ("serviceToken",)]
    assert internas
    for op in internas:
        r = await _llamar(cliente, op, cabeceras_admin)
        assert r.status_code == 401, f"{op}: {r.status_code} {r.text}"


# --- CA-2 ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("op", SOLO_ADMIN, ids=_ids)
async def test_ca2_operador_en_operacion_de_admin_responde_403(
    cliente: httpx.AsyncClient, cabeceras_operador: dict[str, str], op: Operacion
) -> None:
    r = await _llamar(cliente, op, cabeceras_operador)
    assert r.status_code == 403, f"{op}: {r.status_code} {r.text}"
    assert r.json()["error"]["codigo"] == "sin_permiso"


@pytest.mark.parametrize("op", TODOS_LOS_ROLES, ids=_ids)
async def test_ca2_operador_no_rechazado_donde_el_contrato_lo_admite(
    cliente: httpx.AsyncClient, cabeceras_operador: dict[str, str], op: Operacion
) -> None:
    """Complemento de CA-2: la matriz tampoco es más estricta que el contrato."""
    r = await _llamar(cliente, op, cabeceras_operador)
    assert r.status_code not in (401, 403), f"{op}: {r.status_code} {r.text}"


async def test_ca2_usuario_inactivo_rechazado(
    cliente: httpx.AsyncClient, crear_usuario: object
) -> None:
    inactivo = await crear_usuario(activo=False)  # type: ignore[operator]
    r = await cliente.get("/auth/me", headers=cabeceras(inactivo))
    assert r.status_code == 401


# --- CA-3 ---------------------------------------------------------------------------------------


def _rutas_de_la_app(app: FastAPI) -> set[tuple[str, str]]:
    esquema = app.openapi()
    return {(m.upper(), normalizar(ruta)) for ruta, item in esquema["paths"].items() for m in item}


def test_ca3_rutas_de_la_app_coinciden_con_el_contrato(app: FastAPI) -> None:
    rutas = _rutas_de_la_app(app)
    esperadas = {op.clave for op in construidas()}
    assert rutas - esperadas == set(), "rutas que no están en el contrato"
    assert esperadas - rutas == set(), "operaciones del contrato sin ruta"


def test_ca3_pendientes_al_dia(app: FastAPI) -> None:
    """Si una operación pendiente ya existe en la app, hay que quitarla de PENDIENTES para que
    entre en la matriz de permisos."""
    rutas = _rutas_de_la_app(app)
    ya_construidas = [op for op in operaciones() if op.id in PENDIENTES and op.clave in rutas]
    assert ya_construidas == [], "quítalas de PENDIENTES en tests/seguridad/contrato.py"


def test_ca3_ninguna_ruta_oculta_del_esquema() -> None:
    """La comparación usa el esquema OpenAPI de la app; una ruta con `include_in_schema=False`
    escaparía de ella, así que se prohíbe en `app/`."""
    ocultas = []
    for archivo in DIR_APP.rglob("*.py"):
        for nodo in ast.walk(ast.parse(archivo.read_text(encoding="utf-8"))):
            if isinstance(nodo, ast.keyword) and nodo.arg == "include_in_schema":
                ocultas.append(f"{archivo.relative_to(DIR_APP)}:{nodo.value.lineno}")
    assert ocultas == []


async def test_ca3_ruta_fuera_del_contrato_responde_404(cliente: httpx.AsyncClient) -> None:
    r = await cliente.get("/no-existe")
    assert r.status_code == 404
    assert r.json()["error"]["codigo"] == "no_encontrado"
