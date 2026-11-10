from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, SmallInteger, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Plantillas por defecto (spec B-02 §7). La migración las inserta en la fila id = 1.
PLANTILLAS_POR_DEFECTO = {
    "plantilla_recordatorio_asunto": "Tu membresía en {parqueadero} vence el {fecha_vencimiento}",
    "plantilla_recordatorio_cuerpo": (
        "Hola {nombre}:\n\nTe recordamos que tu plan {plan} vence el {fecha_vencimiento}. "
        "El valor de la renovación es {precio}.\n\nGracias por confiar en {parqueadero}."
    ),
    "plantilla_vencida_asunto": "Tu membresía en {parqueadero} venció",
    "plantilla_vencida_cuerpo": (
        "Hola {nombre}:\n\nTu plan {plan} venció el {fecha_vencimiento}. "
        "Puedes renovarlo en tu próxima visita por {precio}.\n\n{parqueadero}"
    ),
}


class Configuracion(Base):
    """Configuración del parqueadero: una sola fila (id = 1)."""

    __tablename__ = "configuracion"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    nombre_parqueadero: Mapped[str] = mapped_column(Text, nullable=False)
    capacidad: Mapped[int | None] = mapped_column(Integer)
    dias_por_vencer: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default=text("3")
    )
    dias_recordatorio: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, server_default=text("'{3,1,0}'")
    )
    plantilla_recordatorio_asunto: Mapped[str] = mapped_column(Text, nullable=False)
    plantilla_recordatorio_cuerpo: Mapped[str] = mapped_column(Text, nullable=False)
    plantilla_vencida_asunto: Mapped[str] = mapped_column(Text, nullable=False)
    plantilla_vencida_cuerpo: Mapped[str] = mapped_column(Text, nullable=False)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("id = 1", name="fila_unica"),
        CheckConstraint("capacidad > 0", name="capacidad_positiva"),
        CheckConstraint("dias_por_vencer BETWEEN 0 AND 30", name="dias_por_vencer_rango"),
    )
