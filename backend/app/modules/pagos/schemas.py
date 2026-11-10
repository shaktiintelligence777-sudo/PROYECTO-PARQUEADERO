import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.esquemas import Dinero, Entrada, TextoOpcional
from app.core.paginacion import Pagina
from app.db.tipos import MetodoPago
from app.modules.membresias.schemas import Membresia
from app.modules.motos.schemas import ClienteRef
from app.modules.planes.schemas import PlanRef


class UsuarioRef(BaseModel):
    id: uuid.UUID
    nombre: str


class Pago(BaseModel):
    id: uuid.UUID
    membresia_id: uuid.UUID
    cliente: ClienteRef
    plan: PlanRef
    monto: int
    metodo: MetodoPago
    periodos: int
    periodo_desde: date
    periodo_hasta: date
    nota: str | None
    registrado_por: UsuarioRef
    creado_en: datetime
    anulado: bool
    anulado_en: datetime | None
    anulado_por: UsuarioRef | None
    motivo_anulacion: str | None


class PaginaPagos(Pagina[Pago]):
    pass


class PagoCrear(Entrada):
    membresia_id: uuid.UUID
    monto: Dinero
    metodo: MetodoPago
    periodos: int = Field(default=1, ge=1, le=12, strict=True)
    nota: TextoOpcional = Field(default=None, max_length=300)


class PagoPrevisualizar(Entrada):
    membresia_id: uuid.UUID
    periodos: int = Field(default=1, ge=1, le=12, strict=True)


class PagoVistaPrevia(BaseModel):
    membresia_id: uuid.UUID
    plan: PlanRef
    periodos: int
    monto_sugerido: int
    periodo_desde: date
    periodo_hasta: date
    vencimiento_actual: date
    vencimiento_nuevo: date


class PagoRegistrado(BaseModel):
    pago: Pago
    membresia: Membresia
