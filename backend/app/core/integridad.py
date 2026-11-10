"""Traduce violaciones de unicidad de PostgreSQL a errores del contrato."""

from sqlalchemy.exc import IntegrityError

from app.core.errores import ErrorApi

# restricción → (código, campo, mensaje)
UNICIDAD: dict[str, tuple[str, str, str]] = {
    "uq_clientes_documento": (
        "documento_duplicado",
        "documento",
        "Ya existe un cliente con ese documento.",
    ),
    "uq_motos_placa": ("placa_duplicada", "placa", "Ya existe una moto con esa placa."),
    "uq_planes_nombre_activo": (
        "nombre_duplicado",
        "nombre",
        "Ya existe un plan activo con ese nombre.",
    ),
    "uq_usuarios_email_lower": (
        "email_duplicado",
        "email",
        "Ya existe un usuario con ese email.",
    ),
}


def nombre_restriccion(exc: IntegrityError) -> str | None:
    causa = getattr(exc.orig, "__cause__", None)
    nombre = getattr(causa, "constraint_name", None)
    return nombre if isinstance(nombre, str) else None


def error_duplicado(codigo: str, campo: str, mensaje: str) -> ErrorApi:
    return ErrorApi(codigo, mensaje, 409, detalles=[{"campo": campo, "mensaje": mensaje}])


def traducir(exc: IntegrityError, campo: str | None = None) -> ErrorApi | None:
    """Devuelve el ErrorApi de la restricción violada, o None si no es una conocida."""
    datos = UNICIDAD.get(nombre_restriccion(exc) or "")
    if datos is None:
        return None
    codigo, campo_defecto, mensaje = datos
    return error_duplicado(codigo, campo or campo_defecto, mensaje)
