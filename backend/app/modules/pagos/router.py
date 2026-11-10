import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, requiere_rol, usuario_actual
from app.core.paginacion import ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.db.tipos import MetodoPago
from app.modules.auth.models import Usuario
from app.modules.membresias.schemas import MotivoEntrada
from app.modules.pagos import service
from app.modules.pagos.schemas import (
    PaginaPagos,
    PagoCrear,
    PagoPrevisualizar,
    PagoRegistrado,
    PagoVistaPrevia,
)

router = APIRouter(prefix="/pagos", tags=["Pagos"])


@router.get("", response_model=PaginaPagos, dependencies=[Depends(usuario_actual)])
async def listar_pagos(
    pag: ParamsPaginacion = Depends(params_paginacion),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    cliente_id: uuid.UUID | None = Query(default=None),
    metodo: MetodoPago | None = Query(default=None),
    incluir_anulados: bool = Query(default=True),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaPagos:
    items, total = await service.listar(
        sesion, pag, desde, hasta, cliente_id, metodo, incluir_anulados
    )
    return PaginaPagos(items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina)


@router.post("", response_model=PagoRegistrado, status_code=status.HTTP_201_CREATED)
async def registrar_pago(
    datos: PagoCrear,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PagoRegistrado:
    return await service.registrar(sesion, datos, usuario, ip_cliente(request))


@router.post(
    "/previsualizar", response_model=PagoVistaPrevia, dependencies=[Depends(usuario_actual)]
)
async def previsualizar_pago(
    datos: PagoPrevisualizar, sesion: AsyncSession = Depends(obtener_sesion)
) -> PagoVistaPrevia:
    return await service.previsualizar(sesion, datos)


@router.post("/{id}/anular", response_model=PagoRegistrado)
async def anular_pago(
    id: uuid.UUID,
    datos: MotivoEntrada,
    request: Request,
    admin: Usuario = Depends(requiere_rol("admin")),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PagoRegistrado:
    return await service.anular(sesion, id, datos, admin, ip_cliente(request))
