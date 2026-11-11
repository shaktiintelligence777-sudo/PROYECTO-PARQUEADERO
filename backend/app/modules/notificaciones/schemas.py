import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.paginacion import Pagina
from app.db.tipos import CanalNotificacion, EstadoNotificacion, TipoNotificacion
from app.modules.motos.schemas import ClienteRef


class Notificacion(BaseModel):
    id: uuid.UUID
    membresia_id: uuid.UUID
    cliente: ClienteRef
    tipo: TipoNotificacion
    canal: CanalNotificacion
    programada_para: date
    estado: EstadoNotificacion
    enviada_en: datetime | None
    intentos: int
    error: str | None
    creado_en: datetime


class PaginaNotificaciones(Pagina[Notificacion]):
    pass


class ResultadoJob(BaseModel):
    fecha: date
    creadas: int = Field(ge=0)
    enviadas: int = Field(ge=0)
    fallidas: int = Field(ge=0)
    omitidas: int = Field(ge=0)
