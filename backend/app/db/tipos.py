"""Tipos enumerados de PostgreSQL compartidos por los modelos."""

from enum import StrEnum

from sqlalchemy import Enum


class Rol(StrEnum):
    ADMIN = "admin"
    OPERADOR = "operador"


class MetodoPago(StrEnum):
    EFECTIVO = "efectivo"
    TRANSFERENCIA = "transferencia"
    OTRO = "otro"


class TipoNotificacion(StrEnum):
    RECORDATORIO = "recordatorio"
    VENCIDA = "vencida"


class CanalNotificacion(StrEnum):
    EMAIL = "email"
    WHATSAPP = "whatsapp"


class EstadoNotificacion(StrEnum):
    PENDIENTE = "pendiente"
    ENVIADA = "enviada"
    FALLIDA = "fallida"
    CANCELADA = "cancelada"


def enum_pg(enum_cls: type[StrEnum], nombre: str) -> Enum:
    """ENUM nativo de PostgreSQL que guarda los valores (no los nombres) del enum de Python."""
    return Enum(enum_cls, name=nombre, values_callable=lambda e: [m.value for m in e])


ROL_USUARIO = enum_pg(Rol, "rol_usuario")
METODO_PAGO = enum_pg(MetodoPago, "metodo_pago")
TIPO_NOTIFICACION = enum_pg(TipoNotificacion, "tipo_notificacion")
CANAL_NOTIFICACION = enum_pg(CanalNotificacion, "canal_notificacion")
ESTADO_NOTIFICACION = enum_pg(EstadoNotificacion, "estado_notificacion")
