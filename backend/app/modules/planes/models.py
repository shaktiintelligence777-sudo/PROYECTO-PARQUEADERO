from sqlalchemy import BigInteger, Boolean, CheckConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Plan(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "planes"

    nombre: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    duracion_dias: Mapped[int] = mapped_column(nullable=False)
    # COP sin decimales (D-6): se guarda como entero en pesos.
    precio: Mapped[int] = mapped_column(BigInteger, nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        CheckConstraint("duracion_dias > 0", name="duracion_positiva"),
        CheckConstraint("precio >= 0", name="precio_no_negativo"),
    )
