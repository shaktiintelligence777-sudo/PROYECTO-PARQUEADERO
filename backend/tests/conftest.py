import os
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from datetime import datetime

# Configuración de pruebas: debe quedar definida antes de importar la app.
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres@127.0.0.1:5432/parqueadero_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["ENTORNO"] = "pruebas"
os.environ["JWT_SECRETO"] = "secreto-de-pruebas-que-no-se-usa-en-ningun-otro-lado"
os.environ["SERVICE_TOKEN"] = "token-de-servicio-de-pruebas-0123456789abcdef"
os.environ["CORS_ORIGENES"] = "http://localhost:5173"

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from sqlalchemy import NullPool  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine  # noqa: E402

from app.core import reloj  # noqa: E402
from app.core.config import obtener_ajustes  # noqa: E402
from app.core.seguridad import crear_access_token, hash_password  # noqa: E402
from app.db.sesion import obtener_sesion  # noqa: E402
from app.db.tipos import Rol  # noqa: E402
from app.main import crear_app  # noqa: E402
from app.modules.auth.models import Usuario  # noqa: E402

DIR_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = "contraseña-segura-123"


def config_alembic() -> Config:
    cfg = Config(os.path.join(DIR_BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(DIR_BACKEND, "alembic"))
    cfg.set_main_option("sqlalchemy.url", obtener_ajustes().database_url)
    return cfg


@pytest.fixture(scope="session", autouse=True)
def _migraciones() -> None:
    """Reconstruye el esquema con las migraciones reales (así también se prueban)."""
    cfg = config_alembic()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
async def motor() -> AsyncIterator[AsyncEngine]:
    m = create_async_engine(obtener_ajustes().database_url, poolclass=NullPool)
    yield m
    await m.dispose()


@pytest.fixture
async def sesion(motor: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Cada prueba corre en una transacción que se revierte al final; los commit() del código
    se convierten en SAVEPOINTs."""
    async with motor.connect() as conexion:
        transaccion = await conexion.begin()
        s = AsyncSession(
            bind=conexion, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield s
        finally:
            await s.close()
            await transaccion.rollback()


@pytest.fixture
def app(sesion: AsyncSession) -> FastAPI:
    aplicacion = crear_app()

    async def _sesion() -> AsyncIterator[AsyncSession]:
        yield sesion

    aplicacion.dependency_overrides[obtener_sesion] = _sesion
    return aplicacion


@pytest.fixture
async def cliente(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://test/api/v1") as c:
        yield c


@pytest.fixture
def reloj_fijo() -> Iterator[Callable[[datetime], None]]:
    """Fija `reloj.ahora()`; se puede llamar varias veces para avanzar el tiempo."""
    yield reloj.fijar
    reloj.fijar(None)


@pytest.fixture
def crear_usuario(sesion: AsyncSession) -> Callable[..., object]:
    async def _crear(
        email: str | None = None,
        password: str = PASSWORD,
        rol: Rol = Rol.OPERADOR,
        activo: bool = True,
    ) -> Usuario:
        usuario = Usuario(
            email=email or f"u{uuid.uuid4().hex[:8]}@parqueadero.app",
            password_hash=hash_password(password),
            nombre="Usuario de prueba",
            rol=rol,
            activo=activo,
        )
        sesion.add(usuario)
        await sesion.flush()
        return usuario

    return _crear


@pytest.fixture
async def usuario_admin(crear_usuario: Callable[..., object]) -> Usuario:
    return await crear_usuario(email="admin@parqueadero.app", rol=Rol.ADMIN)  # type: ignore[no-any-return,misc]


@pytest.fixture
async def usuario_operador(crear_usuario: Callable[..., object]) -> Usuario:
    return await crear_usuario(email="operador@parqueadero.app", rol=Rol.OPERADOR)  # type: ignore[no-any-return,misc]


def cabeceras(usuario: Usuario) -> dict[str, str]:
    return {"Authorization": f"Bearer {crear_access_token(usuario.id, usuario.rol.value).token}"}


@pytest.fixture
def cabeceras_admin(usuario_admin: Usuario) -> dict[str, str]:
    return cabeceras(usuario_admin)


@pytest.fixture
def cabeceras_operador(usuario_operador: Usuario) -> dict[str, str]:
    return cabeceras(usuario_operador)
