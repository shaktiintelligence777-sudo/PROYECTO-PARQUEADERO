"""B-01 · salud."""

from httpx import AsyncClient


async def test_ca1_salud_responde_ok(cliente: AsyncClient) -> None:
    r = await cliente.get("/salud")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["estado"] == "ok"
    assert isinstance(cuerpo["version"], str)


async def test_cabeceras_de_seguridad(cliente: AsyncClient) -> None:
    r = await cliente.get("/salud")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
