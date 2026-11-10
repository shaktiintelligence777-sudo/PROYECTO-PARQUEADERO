import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Identity, Index, Text, func, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ConFechas, ConId
from app.db.tipos import ROL_USUARIO, Rol


class Usuario(ConId, ConFechas, Base):
    """Personal del parqueadero que inicia sesión (admin u operador)."""

    __tablename__ = "usuarios"

    email: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    rol: Mapped[Rol] = mapped_column(ROL_USUARIO, nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (Index("uq_usuarios_email_lower", func.lower(email), unique=True),)


class RefreshToken(ConId, Base):
    """Refresh token rotativo de un solo uso. Solo se guarda su SHA-256 (hex)."""

    __tablename__ = "refresh_tokens"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    familia_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revocado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class IntentoLogin(Base):
    """Intentos de login, para el límite por email e IP (RN-75)."""

    __tablename__ = "intentos_login"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    ip: Mapped[str] = mapped_column(INET, nullable=False)
    exitoso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_intentos_login_email_creado_en", "email", "creado_en"),
        Index("ix_intentos_login_ip_creado_en", "ip", "creado_en"),
    )
