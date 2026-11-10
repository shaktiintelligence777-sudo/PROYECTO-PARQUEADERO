import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Auditoria(Base):
    """Registro inmutable de toda escritura y de los eventos de sesión."""

    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL")
    )
    accion: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad_id: Mapped[str | None] = mapped_column(String(64))
    datos: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(45))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_auditoria_entidad", "entidad", "entidad_id"),
        Index("ix_auditoria_creado_en", "creado_en"),
        Index("ix_auditoria_usuario_id", "usuario_id"),
    )
