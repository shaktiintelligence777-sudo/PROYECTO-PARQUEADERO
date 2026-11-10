import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, requiere_rol, usuario_actual
from app.core.paginacion import ParamsPaginacion, params_paginacion
from app.db.sesion import obtener_sesion
from app.modules.accesos import service
from app.modules.accesos.schemas import (
    AccesoEntrada,
    AccesoRegistrado,
    ConsultaPlaca,
    MotosDentro,
    PaginaEstancias,
)
from app.modules.auth.models import Usuario

router = APIRouter(prefix="/accesos", tags=["Accesos"])


@router.get("/consulta", response_model=ConsultaPlaca, dependencies=[Depends(usuario_actual)])
async def consultar_placa(
    placa: str = Query(min_length=4, max_length=10),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> ConsultaPlaca:
    return await service.consultar(sesion, placa)


@router.post("/entrada", response_model=AccesoRegistrado, status_code=status.HTTP_201_CREATED)
async def registrar_entrada(
    datos: AccesoEntrada,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> AccesoRegistrado:
    return await service.registrar_entrada(sesion, datos.placa, usuario, ip_cliente(request))


@router.post("/salida", response_model=AccesoRegistrado)
async def registrar_salida(
    datos: AccesoEntrada,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> AccesoRegistrado:
    return await service.registrar_salida(sesion, datos.placa, usuario, ip_cliente(request))


@router.get("/dentro", response_model=MotosDentro, dependencies=[Depends(usuario_actual)])
async def listar_motos_dentro(
    placa: str | None = Query(default=None, min_length=1, max_length=10),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> MotosDentro:
    return await service.listar_dentro(sesion, placa)


@router.get(
    "/historial", response_model=PaginaEstancias, dependencies=[Depends(requiere_rol("admin"))]
)
async def listar_historial_accesos(
    pag: ParamsPaginacion = Depends(params_paginacion),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    placa: str | None = Query(default=None, min_length=1, max_length=10),
    operador_id: uuid.UUID | None = Query(default=None),
    cliente_id: uuid.UUID | None = Query(default=None),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> PaginaEstancias:
    return await service.listar_historial(sesion, pag, desde, hasta, placa, operador_id, cliente_id)
