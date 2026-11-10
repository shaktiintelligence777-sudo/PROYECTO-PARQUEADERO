import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, usuario_actual
from app.core.paginacion import Pagina, ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.modules.auth.models import Usuario
from app.modules.motos import service
from app.modules.motos.schemas import Moto, MotoConCliente, MotoCrearConCliente, MotoEditar

router = APIRouter(prefix="/motos", tags=["Motos"])

PaginaMotos = Pagina[MotoConCliente]


@router.get("", response_model=PaginaMotos, dependencies=[Depends(usuario_actual)])
async def listar_motos(
    pag: ParamsPaginacion = Depends(params_paginacion),
    placa: str | None = Query(default=None, min_length=1, max_length=10),
    cliente_id: uuid.UUID | None = Query(default=None),
    activo: bool = Query(default=True),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaMotos:
    items, total = await service.listar(sesion, pag, placa, cliente_id, activo)
    return PaginaMotos(items=items, total=total, pagina=pag.pagina, por_pagina=pag.por_pagina)


@router.post("", response_model=Moto, status_code=status.HTTP_201_CREATED)
async def crear_moto(
    datos: MotoCrearConCliente,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Moto:
    return await service.crear(sesion, datos, usuario, ip_cliente(request))


@router.patch("/{id}", response_model=Moto)
async def editar_moto(
    id: uuid.UUID,
    datos: MotoEditar,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Moto:
    return await service.editar(sesion, id, datos, usuario, ip_cliente(request))
