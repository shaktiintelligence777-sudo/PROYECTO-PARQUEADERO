from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter

router = APIRouter(tags=["Salud"])

try:
    VERSION = version("parqueadero-backend")
except PackageNotFoundError:  # pragma: no cover - ejecución sin instalar el paquete
    VERSION = "0.0.0"


@router.get("/salud")
async def salud() -> dict[str, str]:
    """Comprobación de vida. No toca la base de datos."""
    return {"estado": "ok", "version": VERSION}
