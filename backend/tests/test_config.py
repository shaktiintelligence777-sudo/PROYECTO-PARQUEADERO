"""B-01 · Ajustes y reloj."""

from collections.abc import Callable
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from app.core import reloj
from app.core.config import Ajustes

BASE = {"DATABASE_URL": "postgresql://h/db", "JWT_SECRETO": "x" * 32, "SERVICE_TOKEN": "y" * 32}


def test_ca6_jwt_secreto_corto_falla() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRETO"):
        Ajustes(**{**BASE, "JWT_SECRETO": "corto"})


def test_service_token_corto_falla() -> None:
    with pytest.raises(ValidationError, match="SERVICE_TOKEN"):
        Ajustes(**{**BASE, "SERVICE_TOKEN": "corto"})


@pytest.mark.parametrize(
    "url",
    ["postgres://u:p@h/db", "postgresql://u:p@h/db", "postgresql+asyncpg://u:p@h/db"],
)
def test_database_url_se_normaliza_a_asyncpg(url: str) -> None:
    assert Ajustes(**{**BASE, "DATABASE_URL": url}).database_url == "postgresql+asyncpg://u:p@h/db"


def test_cors_nunca_comodin() -> None:
    with pytest.raises(ValidationError):
        Ajustes(**{**BASE, "CORS_ORIGENES": "*"})


def test_cors_se_separa_por_comas() -> None:
    a = Ajustes(**{**BASE, "CORS_ORIGENES": "https://x.github.io/, http://localhost:5173"})
    assert a.cors_origenes == ["https://x.github.io", "http://localhost:5173"]


def test_ca7_hoy_en_bogota(reloj_fijo: Callable[[datetime], None]) -> None:
    reloj_fijo(datetime(2026, 11, 11, 3, 30, tzinfo=UTC))
    assert reloj.hoy() == date(2026, 11, 10)
    assert reloj.ahora() == datetime(2026, 11, 11, 3, 30, tzinfo=UTC)
