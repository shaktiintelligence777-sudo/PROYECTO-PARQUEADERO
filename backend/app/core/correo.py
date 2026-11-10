"""Envío de correo (B-07). `ProveedorCorreo.enviar(para, asunto, cuerpo)` lanza `ErrorCorreo`.

- `consola`: no envía; registra el destinatario enmascarado y el asunto.
- `smtp`: STARTTLS (puerto 587) o TLS directo (465).
- `resend`: API HTTP de Resend.

Todos envían `text/plain`.
"""

import asyncio
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

import httpx

from app.core.config import Ajustes, obtener_ajustes

log = logging.getLogger("app.correo")

_EMAIL = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
LIMITE_ERROR = 300


def enmascarar(texto: str) -> str:
    """`cliente@example.com` → `c***@example.com`, en cualquier parte del texto."""
    return _EMAIL.sub(r"\1***@\2", texto)


class ErrorCorreo(Exception):
    """Fallo del proveedor. El mensaje ya viene enmascarado y recortado."""

    def __init__(self, mensaje: str) -> None:
        super().__init__(enmascarar(mensaje)[:LIMITE_ERROR])


class ProveedorCorreo(Protocol):
    async def enviar(self, para: str, asunto: str, cuerpo: str) -> None: ...


class CorreoConsola:
    async def enviar(self, para: str, asunto: str, cuerpo: str) -> None:
        log.info("Correo (consola) para %s: %s", enmascarar(para), asunto)


def _mensaje(remitente: str, para: str, asunto: str, cuerpo: str) -> EmailMessage:
    m = EmailMessage()
    m["From"] = remitente
    m["To"] = para
    m["Subject"] = asunto
    m.set_content(cuerpo, subtype="plain", charset="utf-8")
    return m


class CorreoSMTP:
    def __init__(
        self, host: str, puerto: int, usuario: str | None, password: str | None, remitente: str
    ) -> None:
        self.host, self.puerto = host, puerto
        self.usuario, self.password, self.remitente = usuario, password, remitente

    def _enviar(self, mensaje: EmailMessage) -> None:
        contexto = ssl.create_default_context()
        if self.puerto == 465:
            with smtplib.SMTP_SSL(self.host, self.puerto, context=contexto, timeout=20) as s:
                self._autenticar_y_enviar(s, mensaje)
        else:
            with smtplib.SMTP(self.host, self.puerto, timeout=20) as s:
                s.starttls(context=contexto)
                self._autenticar_y_enviar(s, mensaje)

    def _autenticar_y_enviar(self, s: smtplib.SMTP, mensaje: EmailMessage) -> None:
        if self.usuario and self.password:
            s.login(self.usuario, self.password)
        s.send_message(mensaje)

    async def enviar(self, para: str, asunto: str, cuerpo: str) -> None:
        try:
            await asyncio.to_thread(self._enviar, _mensaje(self.remitente, para, asunto, cuerpo))
        except (smtplib.SMTPException, OSError) as exc:
            raise ErrorCorreo(f"SMTP: {exc}") from exc


class CorreoResend:
    URL = "https://api.resend.com/emails"

    def __init__(self, api_key: str, remitente: str) -> None:
        self.api_key, self.remitente = api_key, remitente

    async def enviar(self, para: str, asunto: str, cuerpo: str) -> None:
        datos = {"from": self.remitente, "to": [para], "subject": asunto, "text": cuerpo}
        try:
            async with httpx.AsyncClient(timeout=20) as cliente:
                r = await cliente.post(
                    self.URL, json=datos, headers={"Authorization": f"Bearer {self.api_key}"}
                )
        except httpx.HTTPError as exc:
            raise ErrorCorreo(f"Resend: {exc}") from exc
        if r.status_code >= 300:
            raise ErrorCorreo(f"Resend {r.status_code}: {r.text}")


def crear_proveedor(ajustes: Ajustes) -> ProveedorCorreo:
    # `Ajustes` ya valida que existan los datos de cada proveedor.
    remitente = ajustes.correo_remitente or ""
    if ajustes.correo_proveedor == "smtp":
        return CorreoSMTP(
            ajustes.smtp_host or "",
            ajustes.smtp_puerto,
            ajustes.smtp_usuario,
            ajustes.smtp_password,
            remitente,
        )
    if ajustes.correo_proveedor == "resend":
        return CorreoResend(ajustes.resend_api_key or "", remitente)
    return CorreoConsola()


def obtener_proveedor_correo() -> ProveedorCorreo:
    """Dependencia de FastAPI; las pruebas la sustituyen por un proveedor falso."""
    return crear_proveedor(obtener_ajustes())
