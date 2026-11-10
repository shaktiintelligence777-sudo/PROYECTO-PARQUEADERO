from enum import StrEnum

from sqlalchemy import Boolean, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.db.tipos import enum_texto


class Rol(StrEnum):
    ADMIN = "admin"
    OPERADOR = "operador"


class Usuario(UUIDPKMixin, TimestampMixin, Base):
    """Personal del parqueadero que inicia sesión (admin u operador)."""

    __tablename__ = "usuarios"

    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    rol: Mapped[Rol] = mapped_column(enum_texto(Rol, "rol_usuario"), nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        # Email único sin distinguir mayúsculas.
        Index("uq_usuarios_email_lower", func.lower(email), unique=True),
    )
