"""B-07 · proveedores de correo y su configuración."""

import json
import logging
from typing import Any

import httpx
import pytest

from app.core import correo
from app.core.config import Ajustes
from app.core.correo import (
    CorreoConsola,
    CorreoResend,
    CorreoSMTP,
    ErrorCorreo,
    crear_proveedor,
    enmascarar,
)

BASE = {
    "DATABASE_URL": "postgresql://u@localhost/bd",
    "JWT_SECRETO": "x" * 40,
    "SERVICE_TOKEN": "y" * 40,
}


def _ajustes(**extra: Any) -> Ajustes:
    return Ajustes(**{**BASE, **extra})  # type: ignore[arg-type]


def test_enmascarar() -> None:
    assert enmascarar("cliente@example.com") == "c***@example.com"
    assert enmascarar("Para a.b+c@dominio.co y z@x.org") == "Para a***@dominio.co y z***@x.org"
    assert enmascarar("sin correos") == "sin correos"


def test_error_correo_se_enmascara_y_recorta() -> None:
    e = ErrorCorreo("cliente@example.com " + "x" * 400)
    assert str(e).startswith("c***@example.com ")
    assert len(str(e)) == 300


def test_proveedor_por_defecto_es_consola() -> None:
    assert isinstance(crear_proveedor(_ajustes()), CorreoConsola)


def test_proveedores_configurados() -> None:
    smtp = _ajustes(
        CORREO_PROVEEDOR="smtp", CORREO_REMITENTE="avisos@parqueadero.app", SMTP_HOST="smtp.x"
    )
    assert isinstance(crear_proveedor(smtp), CorreoSMTP)
    resend = _ajustes(
        CORREO_PROVEEDOR="resend", CORREO_REMITENTE="avisos@parqueadero.app", RESEND_API_KEY="k"
    )
    assert isinstance(crear_proveedor(resend), CorreoResend)


@pytest.mark.parametrize(
    ("extra", "falta"),
    [
        ({"CORREO_PROVEEDOR": "smtp", "SMTP_HOST": "smtp.x"}, "CORREO_REMITENTE"),
        ({"CORREO_PROVEEDOR": "smtp", "CORREO_REMITENTE": "a@b.co"}, "SMTP_HOST"),
        ({"CORREO_PROVEEDOR": "resend", "CORREO_REMITENTE": "a@b.co"}, "RESEND_API_KEY"),
    ],
)
def test_configuracion_incompleta_falla(extra: dict[str, str], falta: str) -> None:
    with pytest.raises(ValueError, match=falta):
        _ajustes(**extra)


async def test_consola_no_escribe_el_email_completo(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(logging.getLogger("app.correo"), "disabled", False)
    with caplog.at_level(logging.INFO):
        await CorreoConsola().enviar("cliente@example.com", "Asunto", "Cuerpo")
    assert "c***@example.com" in caplog.text and "cliente@example.com" not in caplog.text


def _resend_con(monkeypatch: pytest.MonkeyPatch, respuesta: httpx.Response) -> list[Any]:
    peticiones: list[Any] = []

    def manejar(peticion: httpx.Request) -> httpx.Response:
        peticiones.append(peticion)
        return respuesta

    original = httpx.AsyncClient

    def cliente(**kw: Any) -> httpx.AsyncClient:
        return original(transport=httpx.MockTransport(manejar), **kw)

    monkeypatch.setattr(correo.httpx, "AsyncClient", cliente)
    return peticiones


async def test_resend_envia_texto_plano(monkeypatch: pytest.MonkeyPatch) -> None:
    peticiones = _resend_con(monkeypatch, httpx.Response(200, json={"id": "1"}))
    await CorreoResend("clave", "avisos@parqueadero.app").enviar("a@b.co", "Asunto", "Cuerpo")
    (p,) = peticiones
    assert p.headers["Authorization"] == "Bearer clave"
    assert p.url == CorreoResend.URL

    assert json.loads(p.content) == {
        "from": "avisos@parqueadero.app", "to": ["a@b.co"], "subject": "Asunto", "text": "Cuerpo"
    }  # fmt: skip


async def test_resend_error_lanza_error_correo(monkeypatch: pytest.MonkeyPatch) -> None:
    _resend_con(monkeypatch, httpx.Response(422, text="destinatario a@b.co no válido"))
    with pytest.raises(ErrorCorreo, match=r"Resend 422: destinatario a\*\*\*@b.co"):
        await CorreoResend("clave", "avisos@parqueadero.app").enviar("a@b.co", "A", "C")
