"""B-05 · planes."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests import fabricas

MENSUAL = {"nombre": "Mensual", "duracion_dias": 30, "precio": 60000}


async def test_admin_crea_plan(cliente: AsyncClient, cabeceras_admin: dict[str, str]) -> None:
    r = await cliente.post("/planes", json=MENSUAL, headers=cabeceras_admin)
    assert r.status_code == 201
    assert {k: r.json()[k] for k in MENSUAL} == MENSUAL
    assert r.json()["activo"] is True


async def test_ca14_operador_no_escribe_planes_pero_los_lista(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion)
    r = await cliente.post("/planes", json=MENSUAL, headers=cabeceras_operador)
    assert r.status_code == 403
    r = await cliente.patch(f"/planes/{plan.id}", json={"precio": 1}, headers=cabeceras_operador)
    assert r.status_code == 403
    r = await cliente.get("/planes", headers=cabeceras_operador)
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["items"]] == [str(plan.id)]


async def test_ca15_nombre_unico_entre_activos(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    primero = await fabricas.plan(sesion, nombre="Mensual")
    r = await cliente.post(
        "/planes", json={**MENSUAL, "nombre": "mensual"}, headers=cabeceras_admin
    )
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "nombre_duplicado"
    assert r.json()["error"]["detalles"][0]["campo"] == "nombre"

    primero.activo = False
    await sesion.flush()
    r = await cliente.post(
        "/planes", json={**MENSUAL, "nombre": "mensual"}, headers=cabeceras_admin
    )
    assert r.status_code == 201

    # Reactivar el primero chocaría con el nuevo.
    r = await cliente.patch(f"/planes/{primero.id}", json={"activo": True}, headers=cabeceras_admin)
    assert r.status_code == 409


@pytest.mark.parametrize(
    "cuerpo",
    [
        {**MENSUAL, "duracion_dias": 0},
        {**MENSUAL, "precio": 0},
        {**MENSUAL, "duracion_dias": 367},
        {**MENSUAL, "precio": 60000.5},
    ],
)
async def test_ca16_duracion_o_precio_invalidos(
    cliente: AsyncClient, cabeceras_admin: dict[str, str], cuerpo: dict[str, Any]
) -> None:
    r = await cliente.post("/planes", json=cuerpo, headers=cabeceras_admin)
    assert r.status_code == 422


async def test_ca17_listar_activos_por_duracion_descendente(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.plan(sesion, nombre="Semanal", dias=7)
    await fabricas.plan(sesion, nombre="Mensual", dias=30)
    await fabricas.plan(sesion, nombre="Quincenal", dias=15)
    await fabricas.plan(sesion, nombre="Anual", dias=365, activo=False)
    r = await cliente.get("/planes", params={"activo": "true"}, headers=cabeceras_operador)
    assert [p["nombre"] for p in r.json()["items"]] == ["Mensual", "Quincenal", "Semanal"]
    r = await cliente.get("/planes", headers=cabeceras_operador)
    assert len(r.json()["items"]) == 4


@pytest.mark.parametrize("cuerpo", [{}, {"color": "azul"}, {"precio": None}])
async def test_ca18_patch_plan_invalido(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    cuerpo: dict[str, Any],
) -> None:
    plan = await fabricas.plan(sesion)
    r = await cliente.patch(f"/planes/{plan.id}", json=cuerpo, headers=cabeceras_admin)
    assert r.status_code == 422


async def test_editar_y_desactivar_plan(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion, nombre="Mensual")
    r = await cliente.patch(
        f"/planes/{plan.id}", json={"precio": 65000, "activo": False}, headers=cabeceras_admin
    )
    assert r.status_code == 200
    assert (r.json()["precio"], r.json()["activo"]) == (65000, False)


async def test_editar_plan_inexistente(
    cliente: AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    r = await cliente.patch(
        "/planes/00000000-0000-0000-0000-000000000000",
        json={"precio": 1},
        headers=cabeceras_admin,
    )
    assert r.status_code == 404
