import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConId
from app.db.tipos import METODO_PAGO, MetodoPago


class Pago(ConId, Base):
    """Los pagos no se editan ni se borran; solo se anulan (D-10, RN-45, RN-46)."""

    __tablename__ = "pagos"

    membresia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("membresias.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("planes.id", ondelete="RESTRICT"), nullable=False
    )
    monto: Mapped[int] = mapped_column(Integer, nullable=False)
    metodo: Mapped[MetodoPago] = mapped_column(METODO_PAGO, nullable=False)
    periodos: Mapped[int] = mapped_column(Integer, nullable=False)
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    vencimiento_anterior: Mapped[date | None] = mapped_column(Date)
    nota: Mapped[str | None] = mapped_column(Text)
    registrado_por: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    anulado_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT")
    )
    motivo_anulacion: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("monto > 0", name="monto_positivo"),
        CheckConstraint("periodos BETWEEN 1 AND 12", name="periodos_rango"),
        CheckConstraint("periodo_hasta >= periodo_desde", name="periodo_ordenado"),
        CheckConstraint("char_length(nota) <= 300", name="nota_longitud"),
        CheckConstraint(
            "(anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)"
            " OR (anulado_en IS NOT NULL AND anulado_por IS NOT NULL"
            " AND motivo_anulacion IS NOT NULL)",
            name="anulacion_completa",
        ),
    )
