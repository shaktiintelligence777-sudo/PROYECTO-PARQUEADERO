"""Errores de la API con el esquema `Error` del contrato: {"error": {codigo, mensaje, detalles}}."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errores")

MENSAJES = {
    "validacion": "Revisa los campos marcados.",
    "no_autenticado": "Tu sesión venció. Inicia sesión otra vez.",
    "token_invalido": "Tu sesión venció. Inicia sesión otra vez.",
    "credenciales_invalidas": "Email o contraseña incorrectos.",
    "password_incorrecta": "La contraseña actual no es correcta.",
    "sin_permiso": "No tienes permiso para hacer esto.",
    "no_encontrado": "No encontramos lo que buscas.",
    "demasiados_intentos": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    "error_interno": "Ocurrió un error inesperado. Inténtalo de nuevo.",
}


class ErrorApi(Exception):
    def __init__(
        self,
        codigo: str,
        mensaje: str | None = None,
        status: int = 400,
        detalles: list[dict[str, str]] | None = None,
        cabeceras: dict[str, str] | None = None,
    ) -> None:
        self.codigo = codigo
        self.mensaje = mensaje or MENSAJES.get(codigo, codigo)
        self.status = status
        self.detalles = detalles
        self.cabeceras = cabeceras
        super().__init__(self.mensaje)


def cuerpo_error(
    codigo: str, mensaje: str, detalles: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    error: dict[str, Any] = {"codigo": codigo, "mensaje": mensaje}
    if detalles is not None:
        error["detalles"] = detalles
    return {"error": error}


def _respuesta(
    status: int,
    codigo: str,
    mensaje: str | None = None,
    detalles: list[dict[str, str]] | None = None,
    cabeceras: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=cuerpo_error(codigo, mensaje or MENSAJES[codigo], detalles),
        headers=cabeceras,
    )


# --- Traducción de errores de validación --------------------------------------------------

_PREFIJOS_LOC = {"body", "query", "path", "header", "cookie"}


def _mensaje_validacion(error: dict[str, Any]) -> str:
    tipo = error.get("type", "")
    ctx = error.get("ctx") or {}
    match tipo:
        case "missing":
            return "Este campo es obligatorio."
        case "extra_forbidden":
            return "Este campo no está permitido."
        case "string_too_short":
            return f"Debe tener al menos {ctx.get('min_length')} caracteres."
        case "string_too_long":
            return f"Debe tener como máximo {ctx.get('max_length')} caracteres."
        case "string_pattern_mismatch":
            return "El formato no es válido."
        case "string_type":
            return "Debe ser un texto."
        case "int_type" | "int_parsing":
            return "Debe ser un número entero."
        case "bool_type" | "bool_parsing":
            return "Debe ser verdadero o falso."
        case "greater_than_equal":
            return f"Debe ser mayor o igual a {ctx.get('ge')}."
        case "greater_than":
            return f"Debe ser mayor que {ctx.get('gt')}."
        case "less_than_equal":
            return f"Debe ser menor o igual a {ctx.get('le')}."
        case "less_than":
            return f"Debe ser menor que {ctx.get('lt')}."
        case "value_error" if "email" in str(error.get("msg", "")).lower():
            return "El email no es válido."
        case "uuid_type" | "uuid_parsing":
            return "Debe ser un identificador válido."
        case "date_type" | "date_parsing" | "date_from_datetime_parsing":
            return "Debe ser una fecha AAAA-MM-DD."
        case "enum" | "literal_error":
            return "El valor no está entre las opciones permitidas."
        case "json_invalid" | "model_attributes_type" | "dict_type":
            return "El cuerpo de la petición no es válido."
    return "El valor no es válido."


def detalles_validacion(errores: Any) -> list[dict[str, str]]:
    detalles = []
    for e in errores:
        loc = list(e.get("loc", ()))
        if loc and loc[0] in _PREFIJOS_LOC:
            loc = loc[1:]
        detalles.append({"campo": ".".join(str(p) for p in loc), "mensaje": _mensaje_validacion(e)})
    return detalles


# --- Manejadores ----------------------------------------------------------------------------


async def _manejar_error_api(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ErrorApi)  # noqa: S101
    return _respuesta(exc.status, exc.codigo, exc.mensaje, exc.detalles, exc.cabeceras)


async def _manejar_validacion(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    return _respuesta(422, "validacion", detalles=detalles_validacion(exc.errors()))


async def _manejar_http(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    if exc.status_code == 404:
        return _respuesta(404, "no_encontrado")
    if exc.status_code == 405:
        return _respuesta(404, "no_encontrado")
    if exc.status_code in (401, 403):
        codigo = "no_autenticado" if exc.status_code == 401 else "sin_permiso"
        return _respuesta(exc.status_code, codigo)
    log.warning("HTTPException no prevista: %s", exc.status_code)
    return _respuesta(500 if exc.status_code >= 500 else 400, "error_interno")


async def _manejar_inesperado(request: Request, exc: Exception) -> JSONResponse:
    # La traza va al log (sin cabeceras ni cuerpo), nunca a la respuesta.
    log.error("Error no controlado en %s %s", request.method, request.url.path, exc_info=exc)
    return _respuesta(500, "error_interno")


def registrar_manejadores(app: FastAPI) -> None:
    app.add_exception_handler(ErrorApi, _manejar_error_api)
    app.add_exception_handler(RequestValidationError, _manejar_validacion)
    app.add_exception_handler(StarletteHTTPException, _manejar_http)
    app.add_exception_handler(Exception, _manejar_inesperado)
