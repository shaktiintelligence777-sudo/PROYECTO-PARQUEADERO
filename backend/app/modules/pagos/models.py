import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPKMixin
from app.db.tipos import enum_texto


class MetodoPago(StrEnum):
    EFECTIVO = "efectivo"
    TRANSFERENCIA = "transferencia"
    OTRO = "otro"


class Pago(UUIDPKMixin, Base):
    """Los pagos son inmutables: no tienen actualizado_en ni borrado."""

    __tablename__ = "pagos"

    membresia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("membresias.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    monto: Mapped[int] = mapped_column(BigInteger, nullable=False)
    metodo: Mapped[MetodoPago] = mapped_column(
        enum_texto(MetodoPago, "metodo_pago"), nullable=False
    )
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    nota: Mapped[str | None] = mapped_column(String(500))
    registrado_por: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        CheckConstraint("monto > 0", name="monto_positivo"),
        CheckConstraint("periodo_hasta >= periodo_desde", name="periodo_ordenado"),
    )
