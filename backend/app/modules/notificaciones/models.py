import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.db.tipos import enum_texto


class TipoNotificacion(StrEnum):
    RECORDATORIO = "recordatorio"
    VENCIDA = "vencida"


class CanalNotificacion(StrEnum):
    EMAIL = "email"
    WHATSAPP = "whatsapp"


class EstadoNotificacion(StrEnum):
    PENDIENTE = "pendiente"
    ENVIADA = "enviada"
    FALLIDA = "fallida"


class Notificacion(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "notificaciones"

    membresia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("membresias.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[TipoNotificacion] = mapped_column(
        enum_texto(TipoNotificacion, "tipo_notificacion"), nullable=False
    )
    canal: Mapped[CanalNotificacion] = mapped_column(
        enum_texto(CanalNotificacion, "canal_notificacion"), nullable=False
    )
    programada_para: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[EstadoNotificacion] = mapped_column(
        enum_texto(EstadoNotificacion, "estado_notificacion"),
        nullable=False,
        default=EstadoNotificacion.PENDIENTE,
        server_default=EstadoNotificacion.PENDIENTE.value,
    )
    intentos: Mapped[int] = mapped_column(nullable=False, default=0, server_default=text("0"))
    enviada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_error: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (
        # Idempotencia del job diario: no se programa dos veces el mismo aviso.
        UniqueConstraint(
            "membresia_id", "tipo", "canal", "programada_para", name="uq_notificaciones_aviso"
        ),
        Index(
            "ix_notificaciones_pendientes",
            "programada_para",
            postgresql_where=text("estado = 'pendiente'"),
        ),
    )
