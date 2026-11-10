import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPKMixin


class Moto(UUIDPKMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "motos"

    cliente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Se guarda normalizada: mayúsculas, sin espacios ni guiones (p. ej. "ABC12D").
    placa: Mapped[str] = mapped_column(String(10), nullable=False)
    marca: Mapped[str | None] = mapped_column(String(60))
    color: Mapped[str | None] = mapped_column(String(40))

    __table_args__ = (
        CheckConstraint("placa ~ '^[A-Z0-9]{4,10}$'", name="placa_normalizada"),
        Index(
            "uq_motos_placa_vigente",
            "placa",
            unique=True,
            postgresql_where=text("eliminado_en IS NULL"),
        ),
    )


def normalizar_placa(placa: str) -> str:
    return "".join(c for c in placa.upper() if c.isalnum())
