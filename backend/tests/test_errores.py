"""B-01 · todos los errores cumplen el esquema `Error` del contrato; CORS."""

from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import BaseModel, ConfigDict, Field

from app.core.errores import ErrorApi


class _Cuerpo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nombre: str = Field(min_length=2)
    edad: int


def _rutas_de_prueba(app: FastAPI) -> None:
    @app.get("/api/v1/prueba/conflicto")
    async def conflicto() -> None:
        raise ErrorApi("moto_ya_dentro", "La moto ya está dentro.", 409)

    @app.post("/api/v1/prueba/validacion")
    async def validacion(cuerpo: _Cuerpo) -> None:
        return None

    @app.get("/api/v1/prueba/explota")
    async def explota() -> None:
        raise RuntimeError("detalle interno secreto")


async def test_ca2_ruta_inexistente_404(cliente: AsyncClient) -> None:
    r = await cliente.get("/no-existe")
    assert r.status_code == 404
    assert r.json()["error"]["codigo"] == "no_encontrado"
    assert r.json()["error"]["mensaje"]


async def test_ca3_error_api_con_su_codigo(app: FastAPI, cliente: AsyncClient) -> None:
    _rutas_de_prueba(app)
    r = await cliente.get("/prueba/conflicto")
    assert r.status_code == 409
    assert r.json() == {"error": {"codigo": "moto_ya_dentro", "mensaje": "La moto ya está dentro."}}


async def test_ca4_validacion_422_con_detalles(app: FastAPI, cliente: AsyncClient) -> None:
    _rutas_de_prueba(app)
    r = await cliente.post("/prueba/validacion", json={"nombre": "A", "edad": 3})
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["codigo"] == "validacion"
    assert error["detalles"][0]["campo"] == "nombre"
    assert error["detalles"][0]["mensaje"] == "Debe tener al menos 2 caracteres."


async def test_ca4_validacion_campo_obligatorio_y_extra(app: FastAPI, cliente: AsyncClient) -> None:
    _rutas_de_prueba(app)
    r = await cliente.post("/prueba/validacion", json={"nombre": "Ana", "otro": 1})
    campos = {d["campo"]: d["mensaje"] for d in r.json()["error"]["detalles"]}
    assert campos == {
        "edad": "Este campo es obligatorio.",
        "otro": "Este campo no está permitido.",
    }


async def test_ca5_excepcion_no_controlada_500_sin_traza(
    app: FastAPI, cliente: AsyncClient
) -> None:
    _rutas_de_prueba(app)
    r = await cliente.get("/prueba/explota")
    assert r.status_code == 500
    assert r.json()["error"]["codigo"] == "error_interno"
    assert "secreto" not in r.text
    assert "Traceback" not in r.text


async def test_ca8_cors_origen_no_permitido(cliente: AsyncClient) -> None:
    permitido = await cliente.options(
        "/salud",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:5173"
    denegado = await cliente.options(
        "/salud",
        headers={"Origin": "https://malicioso.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in denegado.headers
