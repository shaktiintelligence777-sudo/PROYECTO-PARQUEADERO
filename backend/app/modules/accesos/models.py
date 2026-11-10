import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPKMixin


class Estancia(UUIDPKMixin, Base):
    """Una entrada de una moto y, cuando ocurre, su salida. salida_en NULL = la moto está dentro."""

    __tablename__ = "estancias"

    moto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("motos.id", ondelete="RESTRICT"), nullable=False
    )
    entrada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    salida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    operador_entrada: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    operador_salida: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT")
    )

    __table_args__ = (
        CheckConstraint("salida_en IS NULL OR salida_en >= entrada_en", name="salida_posterior"),
        CheckConstraint(
            "(salida_en IS NULL) = (operador_salida IS NULL)", name="salida_con_operador"
        ),
        # Una moto solo puede tener una estancia abierta a la vez.
        Index(
            "uq_estancias_moto_abierta",
            "moto_id",
            unique=True,
            postgresql_where=text("salida_en IS NULL"),
        ),
        Index("ix_estancias_moto_entrada", "moto_id", "entrada_en"),
        Index("ix_estancias_entrada_en", "entrada_en"),
    )
