from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencias import ip_cliente, usuario_actual
from app.db.sesion import obtener_sesion
from app.modules.auth import service
from app.modules.auth.models import Usuario
from app.modules.auth.schemas import (
    CambioPasswordEntrada,
    LoginEntrada,
    RefreshEntrada,
    Sesion,
)
from app.modules.auth.schemas import Usuario as UsuarioSalida

router = APIRouter(prefix="/auth", tags=["Auth"])


def _sesion(emitida: service.SesionEmitida, response: Response) -> Sesion:
    response.headers["Cache-Control"] = "no-store"
    return Sesion(
        access_token=emitida.access_token,
        refresh_token=emitida.refresh_token,
        expires_in=emitida.expires_in,
        usuario=UsuarioSalida.model_validate(emitida.usuario),
    )


@router.post("/login", response_model=Sesion)
async def login(
    datos: LoginEntrada,
    request: Request,
    response: Response,
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Sesion:
    emitida = await service.login(sesion, datos.email, datos.password, ip_cliente(request))
    return _sesion(emitida, response)


@router.post("/refresh", response_model=Sesion)
async def refrescar(
    datos: RefreshEntrada,
    request: Request,
    response: Response,
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Sesion:
    emitida = await service.refrescar(sesion, datos.refresh_token, ip_cliente(request))
    return _sesion(emitida, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    datos: RefreshEntrada, request: Request, sesion: AsyncSession = Depends(obtener_sesion)
) -> Response:
    await service.logout(sesion, datos.refresh_token, ip_cliente(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UsuarioSalida)
async def me(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    return usuario


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
async def cambiar_password(
    datos: CambioPasswordEntrada,
    request: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    await service.cambiar_password(
        sesion, usuario, datos.password_actual, datos.password_nueva, ip_cliente(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
