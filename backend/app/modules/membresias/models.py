import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConFechas, ConId


class Membresia(ConId, ConFechas, Base):
    """Una membresía por cliente cubre todas sus motos (D-7). El estado no se guarda: se
    calcula con `fecha_vencimiento` y `cancelada_en` (D-8, RN-32)."""

    __tablename__ = "membresias"

    cliente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("planes.id", ondelete="RESTRICT"), nullable=False
    )
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cancelada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelada_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT")
    )
    motivo_cancelacion: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("fecha_vencimiento >= fecha_inicio", name="fechas_ordenadas"),
        CheckConstraint(
            "(cancelada_en IS NULL AND cancelada_por IS NULL AND motivo_cancelacion IS NULL)"
            " OR (cancelada_en IS NOT NULL AND cancelada_por IS NOT NULL"
            " AND motivo_cancelacion IS NOT NULL)",
            name="cancelacion_completa",
        ),
        # RN-30: como máximo una membresía no cancelada por cliente.
        Index(
            "uq_membresias_cliente_no_cancelada",
            "cliente_id",
            unique=True,
            postgresql_where=text("cancelada_en IS NULL"),
        ),
    )
