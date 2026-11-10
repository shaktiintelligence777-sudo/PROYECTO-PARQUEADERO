from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_ip, get_usuario_actual
from app.db.session import get_db
from app.modules.auth import service
from app.modules.auth.schemas import LoginIn, RefreshIn, TokensOut
from app.modules.usuarios.models import Usuario
from app.modules.usuarios.schemas import UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])

_CREDENCIALES_INVALIDAS = "Email o contraseña incorrectos"
_SESION_INVALIDA = "Sesión inválida o expirada"


def _tokens(sesion: service.Sesion) -> TokensOut:
    return TokensOut(
        access_token=sesion.access_token,
        refresh_token=sesion.refresh_token,
        expires_in=sesion.expires_in,
        usuario=UsuarioOut.model_validate(sesion.usuario),
    )


@router.post("/login", response_model=TokensOut)
def login(
    datos: LoginIn,
    request: Request,
    response: Response,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> TokensOut:
    try:
        sesion = service.login(db, datos.email, datos.password, get_ip(request), user_agent)
    except service.DemasiadosIntentos as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Intenta de nuevo más tarde.",
            headers={"Retry-After": str(exc.reintentar_en)},
        ) from exc
    except service.CredencialesInvalidas as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_CREDENCIALES_INVALIDAS
        ) from exc
    response.headers["Cache-Control"] = "no-store"
    return _tokens(sesion)


@router.post("/refresh", response_model=TokensOut)
def refresh(
    datos: RefreshIn,
    request: Request,
    response: Response,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> TokensOut:
    try:
        sesion = service.refrescar(db, datos.refresh_token, get_ip(request), user_agent)
    except service.RefreshInvalido as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_SESION_INVALIDA
        ) from exc
    response.headers["Cache-Control"] = "no-store"
    return _tokens(sesion)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(datos: RefreshIn, request: Request, db: Session = Depends(get_db)) -> Response:
    service.logout(db, datos.refresh_token, get_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UsuarioOut)
def me(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    return usuario
