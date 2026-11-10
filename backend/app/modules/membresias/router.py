import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, requiere_rol, usuario_actual
from app.core.paginacion import ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.modules.auth.models import Usuario
from app.modules.membresias import service
from app.modules.membresias.estado import EstadoMembresia
from app.modules.membresias.schemas import (
    Membresia,
    MembresiaCambiarPlan,
    MembresiaCrear,
    MotivoEntrada,
    PaginaMembresias,
)
from app.modules.pagos import service as pagos
from app.modules.pagos.schemas import PaginaPagos

router = APIRouter(prefix="/membresias", tags=["Membresías"])


@router.get("", response_model=PaginaMembresias, dependencies=[Depends(usuario_actual)])
async def listar_membresias(
    pag: ParamsPaginacion = Depends(params_paginacion),
    estado: EstadoMembresia | None = Query(default=None),
    cliente_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1, max_length=80),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaMembresias:
    items, total = await service.listar(sesion, pag, estado, cliente_id, q)
    return PaginaMembresias(items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina)


@router.post("", response_model=Membresia, status_code=status.HTTP_201_CREATED)
async def crear_membresia(
    datos: MembresiaCrear,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Membresia:
    return await service.crear(sesion, datos, usuario, ip_cliente(request))


@router.get("/{id}", response_model=Membresia, dependencies=[Depends(usuario_actual)])
async def obtener_membresia(
    id: uuid.UUID, sesion: AsyncSession = Depends(obtener_sesion)
) -> Membresia:
    return await service.obtener(sesion, id)


@router.patch("/{id}", response_model=Membresia)
async def cambiar_plan_membresia(
    id: uuid.UUID,
    datos: MembresiaCambiarPlan,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Membresia:
    return await service.cambiar_plan(sesion, id, datos, usuario, ip_cliente(request))


@router.post("/{id}/cancelar", response_model=Membresia)
async def cancelar_membresia(
    id: uuid.UUID,
    datos: MotivoEntrada,
    request: Request,
    admin: Usuario = Depends(requiere_rol("admin")),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Membresia:
    return await service.cancelar(sesion, id, datos, admin, ip_cliente(request))


@router.get("/{id}/pagos", response_model=PaginaPagos, dependencies=[Depends(usuario_actual)])
async def listar_pagos_de_membresia(
    id: uuid.UUID,
    pag: ParamsPaginacion = Depends(params_paginacion),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaPagos:
    items, total = await pagos.listar_de_membresia(sesion, id, pag)
    return PaginaPagos(items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina)
