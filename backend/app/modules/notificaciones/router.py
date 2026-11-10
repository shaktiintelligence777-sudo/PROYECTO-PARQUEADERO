import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.correo import ProveedorCorreo, obtener_proveedor_correo
from app.core.dependencias import requiere_rol, requiere_token_servicio
from app.core.paginacion import ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.db.tipos import EstadoNotificacion
from app.modules.notificaciones import service
from app.modules.notificaciones.schemas import PaginaNotificaciones, ResultadoJob

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])
router_interno = APIRouter(prefix="/internal", tags=["Interno"])


@router.get("", response_model=PaginaNotificaciones, dependencies=[Depends(requiere_rol("admin"))])
async def listar_notificaciones(
    pag: ParamsPaginacion = Depends(params_paginacion),
    estado: EstadoNotificacion | None = Query(default=None),
    membresia_id: uuid.UUID | None = Query(default=None),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaNotificaciones:
    items, total = await service.listar(sesion, pag, estado, membresia_id, desde, hasta)
    return PaginaNotificaciones(
        items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina
    )


@router_interno.post(
    "/jobs/notificaciones",
    response_model=ResultadoJob,
    dependencies=[Depends(requiere_token_servicio)],
)
async def ejecutar_job_notificaciones(
    sesion: AsyncSession = Depends(obtener_sesion),
    proveedor: ProveedorCorreo = Depends(obtener_proveedor_correo),
) -> ResultadoJob:
    return await service.ejecutar_job(sesion, proveedor)
