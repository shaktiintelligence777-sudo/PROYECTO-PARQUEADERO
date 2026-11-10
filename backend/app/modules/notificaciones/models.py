import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConId
from app.db.tipos import (
    CANAL_NOTIFICACION,
    ESTADO_NOTIFICACION,
    TIPO_NOTIFICACION,
    CanalNotificacion,
    EstadoNotificacion,
    TipoNotificacion,
)


class Notificacion(ConId, Base):
    __tablename__ = "notificaciones"

    membresia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("membresias.id", ondelete="RESTRICT"), nullable=False
    )
    tipo: Mapped[TipoNotificacion] = mapped_column(TIPO_NOTIFICACION, nullable=False)
    canal: Mapped[CanalNotificacion] = mapped_column(CANAL_NOTIFICACION, nullable=False)
    programada_para: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    estado: Mapped[EstadoNotificacion] = mapped_column(
        ESTADO_NOTIFICACION,
        nullable=False,
        default=EstadoNotificacion.PENDIENTE,
        server_default=text("'pendiente'"),
    )
    enviada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intentos: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    error: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("intentos BETWEEN 0 AND 3", name="intentos_rango"),
        # RN-61: idempotencia del job.
        UniqueConstraint(
            "membresia_id", "tipo", "programada_para", "canal", name="uq_notificaciones_aviso"
        ),
    )
