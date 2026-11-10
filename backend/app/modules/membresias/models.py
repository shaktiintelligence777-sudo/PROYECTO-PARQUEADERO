import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.db.tipos import enum_texto


class EstadoMembresia(StrEnum):
    ACTIVA = "activa"
    POR_VENCER = "por_vencer"
    VENCIDA = "vencida"
    CANCELADA = "cancelada"


class Membresia(UUIDPKMixin, TimestampMixin, Base):
    """Una membresía por cliente cubre todas sus motos (D-7)."""

    __tablename__ = "membresias"

    cliente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("planes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    # Último día cubierto (inclusive).
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[EstadoMembresia] = mapped_column(
        enum_texto(EstadoMembresia, "estado_membresia"),
        nullable=False,
        default=EstadoMembresia.ACTIVA,
        server_default=EstadoMembresia.ACTIVA.value,
    )

    __table_args__ = (
        CheckConstraint("fecha_vencimiento >= fecha_inicio", name="fechas_ordenadas"),
        # Un cliente tiene como máximo una membresía no cancelada; se renueva con pagos.
        Index(
            "uq_membresias_cliente_vigente",
            "cliente_id",
            unique=True,
            postgresql_where=text("estado <> 'cancelada'"),
        ),
        Index("ix_membresias_vencimiento", "fecha_vencimiento"),
    )
