"""B-05 · clientes."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.motos.models import Moto
from tests import fabricas

HOY = date(2026, 11, 10)
AHORA = datetime(2026, 11, 10, 17, 0, tzinfo=UTC)  # 12:00 en Bogotá

NUEVO = {
    "nombre": "José Ñáñez",
    "documento": "1.020.304.050",
    "telefono": "300 123 4567",
    "email": " Jose@Example.com ",
    "notas": "",
    "motos": [{"placa": "abc-12d", "marca": "Honda"}, {"placa": "xyz 98e"}],
}


@pytest.fixture(autouse=True)
def _reloj(reloj_fijo: Callable[[datetime], None]) -> None:
    reloj_fijo(AHORA)


async def test_ca1_crear_cliente_con_dos_motos(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    r = await cliente.post("/clientes", json=NUEVO, headers=cabeceras_operador)
    assert r.status_code == 201
    c = r.json()
    assert c["membresia"] is None
    assert sorted(m["placa"] for m in c["motos"]) == ["ABC12D", "XYZ98E"]
    assert all(m["dentro"] is False and m["activo"] for m in c["motos"])
    # Regla 1: normalización de documento, teléfono, email y cadenas vacías.
    assert (c["documento"], c["telefono"], c["email"], c["notas"]) == (
        "1020304050",
        "3001234567",
        "jose@example.com",
        None,
    )
    assert c["creado_en"].endswith("Z")


async def test_ca2_documento_duplicado(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, documento="1020304050")
    r = await cliente.post("/clientes", json=NUEVO, headers=cabeceras_operador)
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["codigo"] == "documento_duplicado"
    assert error["detalles"][0]["campo"] == "documento"


async def test_ca3_placa_existente_en_la_segunda_moto_no_crea_nada(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, placas=("XYZ98E",))
    antes = await sesion.scalar(select(func.count()).select_from(Cliente))
    r = await cliente.post("/clientes", json=NUEVO, headers=cabeceras_operador)
    assert r.status_code == 409
    error = r.json()["error"]
    assert error["codigo"] == "placa_duplicada"
    assert error["detalles"][0]["campo"] == "motos.1.placa"
    assert await sesion.scalar(select(func.count()).select_from(Cliente)) == antes
    assert await sesion.scalar(select(func.count()).where(Moto.placa == "ABC12D")) == 0


async def test_ca3_placa_repetida_dentro_de_la_peticion(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    cuerpo = {**NUEVO, "motos": [{"placa": "ABC12D"}, {"placa": "abc-12d"}]}
    r = await cliente.post("/clientes", json=cuerpo, headers=cabeceras_operador)
    assert r.status_code == 409
    assert r.json()["error"]["detalles"][0]["campo"] == "motos.1.placa"


@pytest.mark.parametrize(
    ("campo", "valor"), [("telefono", "12"), ("documento", "ab"), ("email", "x@")]
)
async def test_ca4_validacion_de_campos(
    cliente: AsyncClient, cabeceras_operador: dict[str, str], campo: str, valor: str
) -> None:
    r = await cliente.post("/clientes", json={**NUEVO, campo: valor}, headers=cabeceras_operador)
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == campo


async def _crear_jose(cliente: AsyncClient, cabeceras: dict[str, str]) -> dict[str, Any]:
    r = await cliente.post("/clientes", json=NUEVO, headers=cabeceras)
    datos: dict[str, Any] = r.json()
    return datos


@pytest.mark.parametrize("q", ["jose", "nanez", "ÑÁÑEZ", "abc1", "1020", "José Ñá"])
async def test_ca5_busqueda(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str], q: str
) -> None:
    jose = await _crear_jose(cliente, cabeceras_operador)
    await fabricas.cliente(sesion, nombre="Otra Persona", placas=("QWE45R",))
    r = await cliente.get("/clientes", params={"q": q}, headers=cabeceras_operador)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["items"]] == [jose["id"]]


async def test_busqueda_escapa_comodines(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await _crear_jose(cliente, cabeceras_operador)
    r = await cliente.get("/clientes", params={"q": "%"}, headers=cabeceras_operador)
    assert r.json()["total"] == 0


async def test_ca6_filtro_por_estado_de_membresia(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
) -> None:
    plan = await fabricas.plan(sesion)
    ids: dict[str, str] = {}
    for estado, vence in [("activa", 20), ("por_vencer", 3), ("vencida", -1)]:
        c = await fabricas.cliente(sesion, nombre=f"Cliente {estado}")
        await fabricas.membresia(sesion, c.id, plan, HOY + timedelta(days=vence))
        ids[estado] = str(c.id)
    sin = await fabricas.cliente(sesion, nombre="Cliente sin")
    cancelada = await fabricas.cliente(sesion, nombre="Cliente cancelada")
    await fabricas.membresia(sesion, cancelada.id, plan, HOY, cancelada_por=usuario_admin)

    async def filtrar(estado: str) -> set[str]:
        r = await cliente.get(
            "/clientes", params={"estado_membresia": estado}, headers=cabeceras_operador
        )
        return {c["id"] for c in r.json()["items"]}

    for estado in ("activa", "por_vencer", "vencida"):
        assert await filtrar(estado) == {ids[estado]}
    assert await filtrar("sin_membresia") == {str(sin.id), str(cancelada.id)}

    r = await cliente.get("/clientes", params={"q": "por_vencer"}, headers=cabeceras_operador)
    resumen = r.json()["items"][0]["membresia"]
    assert resumen["estado"] == "por_vencer"
    assert resumen["dias_restantes"] == 3
    assert resumen["plan"]["precio"] == 60000


async def test_ca7_paginacion(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    for i in range(25):
        await fabricas.cliente(sesion, nombre=f"Persona {i:02d}")
    r = await cliente.get(
        "/clientes", params={"por_pagina": 10, "pagina": 3}, headers=cabeceras_operador
    )
    cuerpo = r.json()
    assert (len(cuerpo["items"]), cuerpo["total"], cuerpo["pagina"], cuerpo["por_pagina"]) == (
        5,
        25,
        3,
        10,
    )
    assert cuerpo["items"][0]["nombre"] == "Persona 20"  # orden por nombre
    r = await cliente.get("/clientes", params={"por_pagina": 101}, headers=cabeceras_operador)
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "por_pagina"


async def test_ca8_inactivos_fuera_por_defecto(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion, activo=False)
    r = await cliente.get("/clientes", headers=cabeceras_operador)
    assert str(c.id) not in {x["id"] for x in r.json()["items"]}
    r = await cliente.get("/clientes", params={"activo": "false"}, headers=cabeceras_operador)
    assert [x["id"] for x in r.json()["items"]] == [str(c.id)]


async def test_ca9_operador_no_puede_desactivar_cliente(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    cabeceras_admin: dict[str, str],
) -> None:
    c = await fabricas.cliente(sesion)
    r = await cliente.patch(
        f"/clientes/{c.id}", json={"activo": False, "nombre": "Otro"}, headers=cabeceras_operador
    )
    assert r.status_code == 403
    assert r.json()["error"]["codigo"] == "sin_permiso"
    await sesion.refresh(c)
    assert c.activo and c.nombre != "Otro"
    r = await cliente.patch(f"/clientes/{c.id}", json={"activo": False}, headers=cabeceras_admin)
    assert r.status_code == 200
    assert r.json()["activo"] is False


async def test_ca10_desactivar_cliente_desactiva_sus_motos(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion, placas=("AAA11A", "BBB22B"))
    r = await cliente.patch(f"/clientes/{c.id}", json={"activo": False}, headers=cabeceras_admin)
    assert r.status_code == 200
    assert [m["activo"] for m in r.json()["motos"]] == [False, False]
    # Reactivar el cliente no reactiva sus motos (regla 8).
    r = await cliente.patch(f"/clientes/{c.id}", json={"activo": True}, headers=cabeceras_admin)
    assert r.json()["activo"] is True
    assert [m["activo"] for m in r.json()["motos"]] == [False, False]


async def test_ca10_cliente_con_moto_dentro(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
) -> None:
    c = await fabricas.cliente(sesion, placas=("AAA11A", "BBB22B"))
    motos = (await sesion.scalars(select(Moto).where(Moto.cliente_id == c.id))).all()
    await fabricas.dentro(sesion, motos[0].id, usuario_admin)
    r = await cliente.patch(f"/clientes/{c.id}", json={"activo": False}, headers=cabeceras_admin)
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "cliente_con_moto_dentro"
    await sesion.refresh(c)
    assert c.activo
    assert all(m.activo for m in motos)


async def test_ca12_dentro_en_la_ficha(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
) -> None:
    c = await fabricas.cliente(sesion, placas=("AAA11A", "BBB22B"))
    moto = await sesion.scalar(select(Moto).where(Moto.placa == "BBB22B"))
    assert moto is not None
    await fabricas.dentro(sesion, moto.id, usuario_operador)
    r = await cliente.get(f"/clientes/{c.id}", headers=cabeceras_operador)
    assert {m["placa"]: m["dentro"] for m in r.json()["motos"]} == {
        "AAA11A": False,
        "BBB22B": True,
    }


async def test_obtener_inexistente(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    r = await cliente.get(
        "/clientes/00000000-0000-0000-0000-000000000000", headers=cabeceras_operador
    )
    assert r.status_code == 404
    assert r.json()["error"]["codigo"] == "no_encontrado"


@pytest.mark.parametrize("cuerpo", [{}, {"apodo": "x"}, {"nombre": None}])
async def test_ca18_patch_vacio_o_desconocido(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    cuerpo: dict[str, Any],
) -> None:
    c = await fabricas.cliente(sesion)
    r = await cliente.patch(f"/clientes/{c.id}", json=cuerpo, headers=cabeceras_operador)
    assert r.status_code == 422
    assert r.json()["error"]["codigo"] == "validacion"


async def test_editar_documento_duplicado(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, documento="111111")
    c = await fabricas.cliente(sesion)
    r = await cliente.patch(
        f"/clientes/{c.id}", json={"documento": "111111"}, headers=cabeceras_operador
    )
    assert r.status_code == 409
    assert r.json()["error"]["detalles"] == [
        {"campo": "documento", "mensaje": "Ya existe un cliente con ese documento."}
    ]


async def test_ca19_auditoria_de_la_edicion(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
) -> None:
    c = await fabricas.cliente(sesion, nombre="Ana Torres")
    r = await cliente.patch(
        f"/clientes/{c.id}",
        json={"nombre": "Ana María Torres", "telefono": "3001234567"},  # el teléfono no cambia
        headers=cabeceras_operador,
    )
    assert r.status_code == 200
    fila = await sesion.scalar(
        select(Auditoria).where(Auditoria.accion == "cliente.editar", Auditoria.entidad_id == c.id)
    )
    assert fila is not None
    assert fila.usuario_id == usuario_operador.id
    assert fila.datos == {
        "cambios": {"nombre": {"antes": "Ana Torres", "despues": "Ana María Torres"}}
    }


async def test_requiere_sesion(cliente: AsyncClient) -> None:
    assert (await cliente.get("/clientes")).status_code == 401
