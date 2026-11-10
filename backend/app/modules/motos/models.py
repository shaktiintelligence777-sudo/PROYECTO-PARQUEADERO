import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConFechas, ConId


class Moto(ConId, ConFechas, Base):
    __tablename__ = "motos"

    cliente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    placa: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    marca: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        CheckConstraint("placa ~ '^[A-Z0-9]{4,7}$'", name="placa_formato"),
        CheckConstraint("char_length(marca) <= 40", name="marca_longitud"),
        CheckConstraint("char_length(color) <= 30", name="color_longitud"),
    )
