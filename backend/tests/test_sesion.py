"""B-09 · CA-4: TLS obligatorio hacia la base en producción."""

import ssl

import pytest

from app.db.sesion import ConexionInsegura, preparar_conexion

NEON = (
    "postgresql+asyncpg://app:clave@ep-ejemplo.us-east-1.aws.neon.tech/parqueadero"
    "?sslmode=require&channel_binding=require"
)


@pytest.mark.parametrize("modo", ["disable", "allow", "prefer", "DISABLE"])
def test_ca4_produccion_falla_si_la_url_desactiva_tls(modo: str) -> None:
    url = f"postgresql+asyncpg://app:clave@db.ejemplo.com/parqueadero?sslmode={modo}"
    with pytest.raises(ConexionInsegura, match="TLS"):
        preparar_conexion(url, "produccion")


def test_ca4_produccion_falla_con_ssl_disable_de_asyncpg() -> None:
    url = "postgresql+asyncpg://app:clave@db.ejemplo.com/parqueadero?ssl=disable"
    with pytest.raises(ConexionInsegura):
        preparar_conexion(url, "produccion")


@pytest.mark.parametrize("url", [NEON, "postgresql+asyncpg://app:clave@db.ejemplo.com/bd"])
def test_produccion_usa_tls_verificado(url: str) -> None:
    limpia, args = preparar_conexion(url, "produccion")
    assert "sslmode" not in limpia and "channel_binding" not in limpia
    contexto = args["ssl"]
    assert isinstance(contexto, ssl.SSLContext)
    assert contexto.verify_mode == ssl.CERT_REQUIRED
    assert contexto.check_hostname is True


def test_url_limpia_conserva_credenciales_y_base() -> None:
    limpia, _ = preparar_conexion(NEON, "produccion")
    assert limpia == (
        "postgresql+asyncpg://app:clave@ep-ejemplo.us-east-1.aws.neon.tech/parqueadero"
    )


def test_desarrollo_sin_tls_por_defecto() -> None:
    url = "postgresql+asyncpg://postgres@localhost:5432/parqueadero"
    assert preparar_conexion(url, "desarrollo") == (url, {})
    assert preparar_conexion(url + "?sslmode=disable", "pruebas") == (url, {})
    _, args = preparar_conexion(url + "?sslmode=require", "desarrollo")
    assert isinstance(args["ssl"], ssl.SSLContext)
