"""B-07 · CA-15: el workflow del cron es válido y no lleva la URL ni el token en claro.

`actionlint` se ejecuta aparte (ver el PR); aquí se comprueba la estructura y los secretos.
"""

import re
from pathlib import Path
from typing import Any

import yaml

RUTA = Path(__file__).resolve().parents[3] / ".github" / "workflows" / "notificaciones-cron.yml"


def _workflow() -> dict[Any, Any]:
    datos = yaml.safe_load(RUTA.read_text(encoding="utf-8"))
    assert isinstance(datos, dict)
    return datos


def test_ca15_horario_y_ejecucion_manual() -> None:
    w = _workflow()
    disparadores = w[True]  # YAML 1.1 lee la clave `on` como booleano
    assert disparadores["schedule"] == [{"cron": "0 13 * * *"}]
    assert "workflow_dispatch" in disparadores
    assert w["permissions"] == {}


def test_ca15_curl_con_reintentos_y_secretos() -> None:
    (paso,) = _workflow()["jobs"]["ejecutar"]["steps"]
    assert paso["env"] == {
        "API_URL": "${{ secrets.API_URL }}",
        "SERVICE_TOKEN": "${{ secrets.SERVICE_TOKEN }}",
    }
    script = paso["run"]
    for opcion in ("--retry 5", "--retry-all-errors", "--max-time 120"):
        assert opcion in script
    assert "/api/v1/internal/jobs/notificaciones" in script
    assert '"$codigo" != "200"' in script


def test_ca15_sin_url_ni_token_en_claro() -> None:
    texto = RUTA.read_text(encoding="utf-8")
    assert not re.search(r"https?://", texto)
    assert not re.search(r"Bearer [A-Za-z0-9+/=_-]{16,}", texto)
