"""B-05 · motos."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import Usuario
from app.modules.motos.models import Moto
from tests import fabricas


async def _moto(sesion: AsyncSession, placa: str) -> Moto:
    moto = await sesion.scalar(select(Moto).where(Moto.placa == placa))
    assert moto is not None
    return moto


async def test_crear_moto(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion)
    r = await cliente.post(
        "/motos",
        json={"cliente_id": str(c.id), "placa": "abc 12d", "marca": "AKT", "color": ""},
        headers=cabeceras_operador,
    )
    assert r.status_code == 201
    m = r.json()
    assert (m["placa"], m["marca"], m["color"], m["dentro"]) == ("ABC12D", "AKT", None, False)


async def test_crear_moto_placa_duplicada(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion, placas=("ABC12D",))
    r = await cliente.post(
        "/motos", json={"cliente_id": str(c.id), "placa": "abc-12d"}, headers=cabeceras_operador
    )
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "placa_duplicada"
    assert r.json()["error"]["detalles"][0]["campo"] == "placa"


async def test_placa_invalida_es_422(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion)
    r = await cliente.post(
        "/motos", json={"cliente_id": str(c.id), "placa": "AB_12"}, headers=cabeceras_operador
    )
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "placa"


async def test_ca13_crear_moto_para_cliente_inexistente_o_inactivo(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    inactivo = await fabricas.cliente(sesion, activo=False)
    for cliente_id in (str(inactivo.id), "00000000-0000-0000-0000-000000000000"):
        r = await cliente.post(
            "/motos", json={"cliente_id": cliente_id, "placa": "ABC12D"}, headers=cabeceras_operador
        )
        assert r.status_code == 404
        assert r.json()["error"]["codigo"] == "no_encontrado"


async def test_ca9_operador_no_cambia_dueno_ni_activo(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    cabeceras_admin: dict[str, str],
) -> None:
    a = await fabricas.cliente(sesion, placas=("ABC12D",))
    b = await fabricas.cliente(sesion)
    moto = await _moto(sesion, "ABC12D")
    for cuerpo in ({"cliente_id": str(b.id), "color": "Rojo"}, {"activo": False}):
        r = await cliente.patch(f"/motos/{moto.id}", json=cuerpo, headers=cabeceras_operador)
        assert r.status_code == 403
    await sesion.refresh(moto)
    assert (moto.cliente_id, moto.color, moto.activo) == (a.id, None, True)

    r = await cliente.patch(
        f"/motos/{moto.id}", json={"cliente_id": str(b.id)}, headers=cabeceras_admin
    )
    assert r.status_code == 200
    assert r.json()["cliente_id"] == str(b.id)


async def test_operador_puede_editar_datos_basicos(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, placas=("ABC12D",))
    moto = await _moto(sesion, "ABC12D")
    r = await cliente.patch(
        f"/motos/{moto.id}", json={"color": "Azul", "placa": "abc-12e"}, headers=cabeceras_operador
    )
    assert r.status_code == 200
    assert (r.json()["color"], r.json()["placa"]) == ("Azul", "ABC12E")


async def test_ca11_desactivar_moto_dentro(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
) -> None:
    await fabricas.cliente(sesion, placas=("ABC12D",))
    moto = await _moto(sesion, "ABC12D")
    await fabricas.dentro(sesion, moto.id, usuario_admin)
    r = await cliente.patch(f"/motos/{moto.id}", json={"activo": False}, headers=cabeceras_admin)
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "moto_dentro"


async def test_ca12_dentro_en_listar_motos(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
) -> None:
    c = await fabricas.cliente(sesion, nombre="Ana", placas=("ABC12D", "ABD34E"))
    await fabricas.dentro(sesion, (await _moto(sesion, "ABD34E")).id, usuario_operador)
    r = await cliente.get("/motos", params={"placa": "ab"}, headers=cabeceras_operador)
    cuerpo = r.json()
    assert cuerpo["total"] == 2
    assert [(m["placa"], m["dentro"]) for m in cuerpo["items"]] == [
        ("ABC12D", False),
        ("ABD34E", True),
    ]
    assert cuerpo["items"][0]["cliente"] == {
        "id": str(c.id),
        "nombre": "Ana",
        "documento": c.documento,
        "telefono": c.telefono,
    }


async def test_listar_motos_por_cliente_y_activo(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    a = await fabricas.cliente(sesion, placas=("AAA11A",))
    await fabricas.cliente(sesion, placas=("BBB22B",))
    r = await cliente.get("/motos", params={"cliente_id": str(a.id)}, headers=cabeceras_operador)
    assert [m["placa"] for m in r.json()["items"]] == ["AAA11A"]
    moto = await _moto(sesion, "AAA11A")
    moto.activo = False
    await sesion.flush()
    r = await cliente.get("/motos", headers=cabeceras_operador)
    assert [m["placa"] for m in r.json()["items"]] == ["BBB22B"]
    r = await cliente.get("/motos", params={"activo": "false"}, headers=cabeceras_operador)
    assert [m["placa"] for m in r.json()["items"]] == ["AAA11A"]
