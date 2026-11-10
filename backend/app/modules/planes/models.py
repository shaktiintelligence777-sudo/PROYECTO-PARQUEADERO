from sqlalchemy import Boolean, CheckConstraint, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConFechas, ConId


class Plan(ConId, ConFechas, Base):
    __tablename__ = "planes"

    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    duracion_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    precio: Mapped[int] = mapped_column(Integer, nullable=False)  # COP enteros (RN-02)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        CheckConstraint("duracion_dias BETWEEN 1 AND 366", name="duracion_rango"),
        CheckConstraint("precio > 0", name="precio_positivo"),
        CheckConstraint("char_length(nombre) BETWEEN 2 AND 60", name="nombre_longitud"),
        Index(
            "uq_planes_nombre_activo",
            func.lower(nombre),
            unique=True,
            postgresql_where=text("activo"),
        ),
    )
