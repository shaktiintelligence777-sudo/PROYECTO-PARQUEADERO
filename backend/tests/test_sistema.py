import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_health_responde_ok_con_base_de_datos(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"estado": "ok", "base_de_datos": "ok"}


def test_cabeceras_de_seguridad(client):
    r = client.get("/api/v1/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


def test_cors_permite_solo_origenes_configurados(client):
    permitido = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:5173"
    denegado = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://malicioso.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in denegado.headers


@pytest.mark.parametrize(
    ("entrada", "esperada"),
    [
        ("postgres://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
    ],
)
def test_database_url_se_normaliza(entrada, esperada):
    s = Settings(DATABASE_URL=entrada, JWT_SECRET="x" * 32)
    assert s.database_url == esperada


def test_jwt_secret_corto_es_rechazado():
    with pytest.raises(ValidationError):
        Settings(DATABASE_URL="postgresql://h/db", JWT_SECRET="corto")


def test_produccion_rechaza_cors_comodin():
    with pytest.raises(ValidationError):
        Settings(
            ENTORNO="produccion",
            DATABASE_URL="postgresql://h/db",
            JWT_SECRET="x" * 32,
            CORS_ORIGINS="*",
        )


def test_cors_origins_se_separa_por_comas():
    s = Settings(
        DATABASE_URL="postgresql://h/db",
        JWT_SECRET="x" * 32,
        CORS_ORIGINS="https://a.github.io/, http://localhost:5173",
    )
    assert s.cors_origins == ["https://a.github.io", "http://localhost:5173"]
