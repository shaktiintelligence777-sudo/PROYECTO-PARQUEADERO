from sqlalchemy import Boolean, CheckConstraint, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConFechas, ConId


class Cliente(ConId, ConFechas, Base):
    __tablename__ = "clientes"

    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    documento: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    telefono: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    notas: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        CheckConstraint("char_length(nombre) BETWEEN 2 AND 120", name="nombre_longitud"),
        CheckConstraint("documento ~ '^[A-Za-z0-9]{5,20}$'", name="documento_formato"),
        CheckConstraint("telefono ~ '^\\+?[0-9]{7,15}$'", name="telefono_formato"),
        CheckConstraint("char_length(email) <= 254", name="email_longitud"),
        CheckConstraint("char_length(notas) <= 500", name="notas_longitud"),
        # Búsqueda por nombre sin tildes ni mayúsculas (f_unaccent es un envoltorio IMMUTABLE).
        Index("ix_clientes_nombre_busqueda", func.lower(func.f_unaccent(nombre))),
    )
