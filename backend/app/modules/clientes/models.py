from sqlalchemy import Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPKMixin


class Cliente(UUIDPKMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "clientes"

    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    documento: Mapped[str] = mapped_column(String(30), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(254))

    __table_args__ = (
        # Documento único entre los clientes no eliminados.
        Index(
            "uq_clientes_documento_vigente",
            "documento",
            unique=True,
            postgresql_where=text("eliminado_en IS NULL"),
        ),
        Index("ix_clientes_nombre", "nombre"),
    )
