"""Tipos de columna compartidos."""

from enum import StrEnum

from sqlalchemy import Enum


def enum_texto(enum_cls: type[StrEnum], nombre: str) -> Enum:
    """Enum guardado como texto con CHECK (más fácil de migrar que un ENUM nativo de PostgreSQL)."""
    return Enum(
        enum_cls,
        name=nombre,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )
