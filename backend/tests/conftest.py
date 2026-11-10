import os
import uuid
from collections.abc import Iterator

# Configuración de pruebas: debe definirse antes de importar la app.
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5432/parqueadero_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["ENTORNO"] = "pruebas"
os.environ["JWT_SECRET"] = "secreto-de-pruebas-que-no-se-usa-en-ningun-otro-lado"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["INTERNAL_JOB_TOKEN"] = "token-interno-de-pruebas-0123456789abcdef"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import get_db, get_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.modules.usuarios.models import Rol, Usuario  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = "contraseña-segura-123"


@pytest.fixture(scope="session", autouse=True)
def _migraciones() -> None:
    """Aplica las migraciones reales sobre una base limpia (así también se prueban)."""
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture
def db() -> Iterator[Session]:
    """Cada prueba corre dentro de una transacción que se revierte al final.
    Los commit() del código se convierten en SAVEPOINTs."""
    conexion = get_engine().connect()
    transaccion = conexion.begin()
    sesion = Session(
        bind=conexion, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield sesion
    finally:
        sesion.close()
        transaccion.rollback()
        conexion.close()


@pytest.fixture
def app(db: Session):
    aplicacion = create_app()
    aplicacion.dependency_overrides[get_db] = lambda: db
    return aplicacion


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def crear_usuario(db: Session):
    def _crear(
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
        db.add(usuario)
        db.flush()
        return usuario

    return _crear


@pytest.fixture
def login(client: TestClient):
    def _login(email: str, password: str = PASSWORD):
        return client.post("/api/v1/auth/login", json={"email": email, "password": password})

    return _login
