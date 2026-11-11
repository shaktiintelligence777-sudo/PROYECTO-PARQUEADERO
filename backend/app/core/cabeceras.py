"""Cabeceras de seguridad comunes a todas las respuestas (C-03, punto 5 de la auditoría)."""

from starlette.datastructures import MutableHeaders
from starlette.requests import Request

FIJAS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}
HSTS = "max-age=63072000; includeSubDomains"


def aplicar(request: Request, cabeceras: MutableHeaders, es_produccion: bool) -> None:
    """Añade las cabeceras sin pisar las que ya puso el endpoint. Una petición con
    `Authorization` lleva datos privados en la respuesta: no se guarda en ninguna caché."""
    for nombre, valor in FIJAS.items():
        cabeceras.setdefault(nombre, valor)
    if "authorization" in request.headers:
        cabeceras["Cache-Control"] = "no-store"
    if es_produccion:
        cabeceras.setdefault("Strict-Transport-Security", HSTS)
