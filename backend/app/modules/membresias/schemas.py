import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.esquemas import Dinero, Entrada, Texto, TextoOpcional
from app.core.paginacion import Pagina
from app.db.tipos import MetodoPago
from app.modules.membresias.estado import EstadoMembresia
from app.modules.motos.schemas import ClienteRef
from app.modules.planes.schemas import PlanRef


class Membresia(BaseModel):
    id: uuid.UUID
    cliente: ClienteRef
    plan: PlanRef
    placas: list[str]
    fecha_inicio: date
    fecha_vencimiento: date
    estado: EstadoMembresia
    dias_restantes: int
    cancelada_en: datetime | None
    motivo_cancelacion: str | None
    creado_en: datetime


class PaginaMembresias(Pagina[Membresia]):
    pass


class PagoInicial(Entrada):
    monto: Dinero
    metodo: MetodoPago
    nota: TextoOpcional = Field(default=None, max_length=300)


class MembresiaCrear(Entrada):
    cliente_id: uuid.UUID
    plan_id: uuid.UUID
    fecha_inicio: date | None = None
    pago_inicial: PagoInicial


class MembresiaCambiarPlan(Entrada):
    plan_id: uuid.UUID


class MotivoEntrada(Entrada):
    motivo: Texto = Field(min_length=5, max_length=300)
