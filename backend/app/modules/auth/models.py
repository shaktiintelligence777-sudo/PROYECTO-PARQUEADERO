import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPKMixin


class RefreshToken(UUIDPKMixin, Base):
    """Refresh token rotativo. Solo se guarda el hash SHA-256; el token en claro nunca toca la BD.

    Todos los tokens de una misma sesión comparten `familia_id`. Si se presenta un token ya
    rotado (reutilización), se revoca la familia completa.
    """

    __tablename__ = "refresh_tokens"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    familia_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revocado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reemplazado_por: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("refresh_tokens.id", ondelete="SET NULL")
    )
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class IntentoLogin(UUIDPKMixin, Base):
    """Intentos de login, para el límite por email e IP."""

    __tablename__ = "intentos_login"

    email: Mapped[str] = mapped_column(String(254), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45))
    exitoso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_intentos_login_email_creado", "email", "creado_en"),
        Index("ix_intentos_login_ip_creado", "ip", "creado_en"),
    )
