import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, usuario_actual
from app.core.paginacion import ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.modules.auth.models import Usuario
from app.modules.clientes import service
from app.modules.clientes.schemas import ClienteCrear, ClienteDetalle, ClienteEditar, PaginaClientes

router = APIRouter(prefix="/clientes", tags=["Clientes"])

EstadoFiltro = Literal["activa", "por_vencer", "vencida", "sin_membresia"]


@router.get("", response_model=PaginaClientes, dependencies=[Depends(usuario_actual)])
async def listar_clientes(
    pag: ParamsPaginacion = Depends(params_paginacion),
    q: str | None = Query(default=None, min_length=1, max_length=80),
    estado_membresia: EstadoFiltro | None = Query(default=None),
    activo: bool = Query(default=True),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaClientes:
    items, total = await service.listar(sesion, pag, q, estado_membresia, activo)
    return PaginaClientes(items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina)


@router.post("", response_model=ClienteDetalle, status_code=status.HTTP_201_CREATED)
async def crear_cliente(
    datos: ClienteCrear,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> ClienteDetalle:
    return await service.crear(sesion, datos, usuario, ip_cliente(request))


@router.get("/{id}", response_model=ClienteDetalle, dependencies=[Depends(usuario_actual)])
async def obtener_cliente(
    id: uuid.UUID, sesion: AsyncSession = Depends(obtener_sesion)
) -> ClienteDetalle:
    return await service.obtener(sesion, id)


@router.patch("/{id}", response_model=ClienteDetalle)
async def editar_cliente(
    id: uuid.UUID,
    datos: ClienteEditar,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> ClienteDetalle:
    return await service.editar(sesion, id, datos, usuario, ip_cliente(request))
