import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, requiere_rol, usuario_actual
from app.db.sesion import obtener_sesion
from app.modules.auth.models import Usuario
from app.modules.planes import service
from app.modules.planes.models import Plan
from app.modules.planes.schemas import ListaPlanes, PlanCrear, PlanEditar
from app.modules.planes.schemas import Plan as PlanSalida

router = APIRouter(prefix="/planes", tags=["Planes"])


@router.get("", response_model=ListaPlanes, dependencies=[Depends(usuario_actual)])
async def listar_planes(
    activo: bool | None = Query(default=None), sesion: AsyncSession = Depends(obtener_sesion)
) -> ListaPlanes:
    planes = await service.listar(sesion, activo)
    return ListaPlanes(items=[PlanSalida.model_validate(p) for p in planes])


@router.post("", response_model=PlanSalida, status_code=status.HTTP_201_CREATED)
async def crear_plan(
    datos: PlanCrear,
    request: Request,
    admin: Usuario = Depends(requiere_rol("admin")),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Plan:
    return await service.crear(sesion, datos, admin, ip_cliente(request))


@router.patch("/{id}", response_model=PlanSalida)
async def editar_plan(
    id: uuid.UUID,
    datos: PlanEditar,
    request: Request,
    admin: Usuario = Depends(requiere_rol("admin")),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Plan:
    return await service.editar(sesion, id, datos, admin, ip_cliente(request))
