"""B-07 · job de notificaciones y listado."""

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.correo import ErrorCorreo, obtener_proveedor_correo
from app.db.tipos import CanalNotificacion, EstadoNotificacion, TipoNotificacion
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.models import Membresia
from app.modules.notificaciones.models import Notificacion
from tests import fabricas
from tests.conftest import cabeceras

HOY = date(2026, 11, 10)
AHORA = datetime(2026, 11, 10, 13, 0, tzinfo=UTC)  # 8:00 en Bogotá
TOKEN = {"Authorization": "Bearer token-de-servicio-de-pruebas-0123456789abcdef"}
Reloj = Callable[[datetime], None]


class ProveedorFalso:
    def __init__(self) -> None:
        self.enviados: list[tuple[str, str, str]] = []
        self.fallan: set[str] = set()

    async def enviar(self, para: str, asunto: str, cuerpo: str) -> None:
        if para in self.fallan:
            raise ErrorCorreo(f"Buzón lleno para {para}")
        self.enviados.append((para, asunto, cuerpo))

    def para(self) -> list[str]:
        return sorted(p for p, _, _ in self.enviados)


@pytest.fixture
def proveedor(app: FastAPI) -> ProveedorFalso:
    falso = ProveedorFalso()
    app.dependency_overrides[obtener_proveedor_correo] = lambda: falso
    return falso


@pytest.fixture
def hoy(reloj_fijo: Reloj) -> date:
    reloj_fijo(AHORA)
    return HOY


async def _con_membresia(
    sesion: AsyncSession, vence_en: int, email: str | None = "cliente@example.com", **extra: Any
) -> Membresia:
    plan = await fabricas.plan(sesion, nombre=f"Mensual {email}-{vence_en}", precio=60000)
    c = await fabricas.cliente(sesion, email=email, **extra)
    return await fabricas.membresia(sesion, c.id, plan, HOY + timedelta(days=vence_en))


async def _job(cliente: AsyncClient) -> dict[str, Any]:
    r = await cliente.post("/internal/jobs/notificaciones", headers=TOKEN)
    assert r.status_code == 200, r.text
    return dict(r.json())


async def _de(sesion: AsyncSession, m: Membresia) -> list[Notificacion]:
    filas = await sesion.scalars(
        select(Notificacion)
        .where(Notificacion.membresia_id == m.id)
        .execution_options(populate_existing=True)
    )
    return list(filas)


async def test_ca1_ca2_ca3_recordatorios_y_vencidas(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    m3 = await _con_membresia(sesion, 3, "tres@example.com")
    m1 = await _con_membresia(sesion, 1, "uno@example.com")
    m0 = await _con_membresia(sesion, 0, "cero@example.com")
    ayer = await _con_membresia(sesion, -1, "ayer@example.com")
    hace2 = await _con_membresia(sesion, -2, "hace2@example.com")
    en2 = await _con_membresia(sesion, 2, "dos@example.com")

    resultado = await _job(cliente)
    assert resultado == {
        "fecha": "2026-11-10", "creadas": 4, "enviadas": 4, "fallidas": 0, "omitidas": 0
    }  # fmt: skip
    for m in (m3, m1, m0):
        (n,) = await _de(sesion, m)
        assert n.tipo == TipoNotificacion.RECORDATORIO
        assert n.estado == EstadoNotificacion.ENVIADA and n.enviada_en is not None
        assert n.canal == CanalNotificacion.EMAIL and n.programada_para == hoy
    (n,) = await _de(sesion, ayer)
    assert n.tipo == TipoNotificacion.VENCIDA and n.estado == EstadoNotificacion.ENVIADA
    assert await _de(sesion, hace2) == []
    assert await _de(sesion, en2) == []
    assert proveedor.para() == sorted(
        ["tres@example.com", "uno@example.com", "cero@example.com", "ayer@example.com"]
    )


async def test_ca4_segunda_ejecucion_no_reenvia(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    await _con_membresia(sesion, 3)
    await _con_membresia(sesion, -1)
    assert (await _job(cliente))["enviadas"] == 2
    segunda = await _job(cliente)
    assert segunda["creadas"] == 0 and segunda["enviadas"] == 0
    assert segunda["omitidas"] == 2
    assert len(proveedor.enviados) == 2


async def test_ca5_sin_email_inactivo_o_cancelada(
    sesion: AsyncSession,
    cliente: AsyncClient,
    proveedor: ProveedorFalso,
    hoy: date,
    usuario_admin: Usuario,
) -> None:
    sin_email = await _con_membresia(sesion, 3, email=None)
    inactivo = await _con_membresia(sesion, 3, "inactivo@example.com", activo=False)
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion, email="cancelada@example.com")
    cancelada = await fabricas.membresia(
        sesion, c.id, plan, HOY + timedelta(days=3), cancelada_por=usuario_admin
    )
    resultado = await _job(cliente)
    assert resultado["creadas"] == 0
    for m in (sin_email, inactivo, cancelada):
        assert await _de(sesion, m) == []
    assert proveedor.enviados == []


async def test_ca6_ca7_fallo_de_un_destinatario_y_reintentos(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    falla = await _con_membresia(sesion, 1, "falla@example.com")
    bien = await _con_membresia(sesion, 1, "bien@example.com")
    proveedor.fallan.add("falla@example.com")

    resultado = await _job(cliente)
    assert (resultado["enviadas"], resultado["fallidas"]) == (1, 1)
    (n,) = await _de(sesion, falla)
    assert n.estado == EstadoNotificacion.FALLIDA and n.intentos == 1
    assert n.error is not None and "f***@example.com" in n.error
    assert "falla@example.com" not in n.error
    (ok,) = await _de(sesion, bien)
    assert ok.estado == EstadoNotificacion.ENVIADA

    # CA-7: se reintenta dentro del mismo día hasta 3 intentos.
    for intento in (2, 3):
        resultado = await _job(cliente)
        assert resultado["fallidas"] == 1
        (n,) = await _de(sesion, falla)
        assert n.intentos == intento
    resultado = await _job(cliente)
    assert resultado["fallidas"] == 0 and resultado["omitidas"] == 2
    (n,) = await _de(sesion, falla)
    assert n.intentos == 3

    # Si el proveedor se recupera, una fallida con intentos disponibles queda enviada.
    otra = await _con_membresia(sesion, 0, "luego@example.com")
    proveedor.fallan.add("luego@example.com")
    await _job(cliente)
    proveedor.fallan.clear()
    resultado = await _job(cliente)
    assert resultado["enviadas"] == 1
    (n,) = await _de(sesion, otra)
    assert n.estado == EstadoNotificacion.ENVIADA and n.intentos == 1


async def test_ca8_no_se_envian_las_de_dias_anteriores(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    m = await _con_membresia(sesion, 10, "viejo@example.com")
    viejas = [
        Notificacion(
            membresia_id=m.id,
            tipo=TipoNotificacion.RECORDATORIO,
            canal=CanalNotificacion.EMAIL,
            programada_para=HOY - timedelta(days=1),
            estado=EstadoNotificacion.PENDIENTE,
        ),
        Notificacion(
            membresia_id=m.id,
            tipo=TipoNotificacion.VENCIDA,
            canal=CanalNotificacion.EMAIL,
            programada_para=HOY - timedelta(days=1),
            estado=EstadoNotificacion.FALLIDA,
            intentos=1,
            error="Fallo anterior",
        ),
    ]
    sesion.add_all(viejas)
    await sesion.flush()
    resultado = await _job(cliente)
    assert resultado["enviadas"] == 0 and resultado["fallidas"] == 0
    assert proveedor.enviados == []
    estados = {n.tipo: (n.estado, n.intentos) for n in await _de(sesion, m)}
    assert estados == {
        TipoNotificacion.RECORDATORIO: (EstadoNotificacion.PENDIENTE, 0),
        TipoNotificacion.VENCIDA: (EstadoNotificacion.FALLIDA, 1),
    }


async def test_ca9_correo_con_la_plantilla_por_defecto(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, reloj_fijo: Reloj
) -> None:
    reloj_fijo(datetime(2026, 11, 8, 13, 0, tzinfo=UTC))  # vence en 3 días
    plan = await fabricas.plan(sesion, nombre="Mensual", precio=60000)
    c = await fabricas.cliente(sesion, nombre="Ana Pérez", email="ana@example.com")
    await fabricas.membresia(sesion, c.id, plan, date(2026, 11, 11))
    await _job(cliente)
    ((para, asunto, cuerpo),) = proveedor.enviados
    assert para == "ana@example.com"
    for esperado in ("Ana Pérez", "Mensual", "11 de noviembre de 2026", "$60.000"):
        assert esperado in cuerpo
    assert "11 de noviembre de 2026" in asunto
    assert "{" not in asunto + cuerpo and "}" not in asunto + cuerpo


async def test_ca11_dias_recordatorio_configurados(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    config = await sesion.get(Configuracion, 1)
    assert config is not None
    config.dias_recordatorio = [5]
    await sesion.flush()
    cinco = await _con_membresia(sesion, 5, "cinco@example.com")
    await _con_membresia(sesion, 3, "tres@example.com")
    await _con_membresia(sesion, 0, "cero@example.com")
    await _job(cliente)
    assert proveedor.para() == ["cinco@example.com"]
    (n,) = await _de(sesion, cinco)
    assert n.tipo == TipoNotificacion.RECORDATORIO


async def test_ca12_job_exige_token_de_servicio(
    cliente: AsyncClient, proveedor: ProveedorFalso, cabeceras_admin: dict[str, str]
) -> None:
    ruta = "/internal/jobs/notificaciones"
    assert (await cliente.post(ruta)).status_code == 401
    r = await cliente.post(ruta, headers={"Authorization": "Bearer otro-token"})
    assert r.status_code == 401
    assert (await cliente.post(ruta, headers=cabeceras_admin)).status_code == 401
    assert proveedor.enviados == []


async def test_ca13_listado_por_estado_solo_admin(
    sesion: AsyncSession,
    cliente: AsyncClient,
    proveedor: ProveedorFalso,
    hoy: date,
    usuario_admin: Usuario,
    usuario_operador: Usuario,
) -> None:
    falla = await _con_membresia(sesion, 1, "falla@example.com", nombre="Cliente que falla")
    await _con_membresia(sesion, 1, "bien@example.com")
    proveedor.fallan.add("falla@example.com")
    await _job(cliente)

    r = await cliente.get(
        "/notificaciones", params={"estado": "fallida"}, headers=cabeceras(usuario_admin)
    )
    assert r.status_code == 200, r.text
    (item,) = r.json()["items"]
    assert item["membresia_id"] == str(falla.id)
    assert item["estado"] == "fallida" and item["intentos"] == 1
    assert item["cliente"]["nombre"] == "Cliente que falla"
    assert r.json()["total"] == 1

    r = await cliente.get(
        "/notificaciones",
        params={"desde": "2026-11-10", "hasta": "2026-11-10"},
        headers=cabeceras(usuario_admin),
    )
    assert r.json()["total"] == 2
    r = await cliente.get(
        "/notificaciones", params={"hasta": "2026-11-09"}, headers=cabeceras(usuario_admin)
    )
    assert r.json()["total"] == 0
    r = await cliente.get("/notificaciones", headers=cabeceras(usuario_operador))
    assert r.status_code == 403


async def test_ca14_log_sin_emails_y_auditoria(
    sesion: AsyncSession,
    cliente: AsyncClient,
    proveedor: ProveedorFalso,
    hoy: date,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `fileConfig` de Alembic (en la migración inicial de las pruebas) desactiva los loggers
    # que ya existían; aquí se reactivan para poder leer lo que escribe el job.
    for nombre in ("app.jobs.notificaciones", "app.correo"):
        monkeypatch.setattr(logging.getLogger(nombre), "disabled", False)
    await _con_membresia(sesion, 3, "privado@example.com")
    await _con_membresia(sesion, 1, "roto@example.com")
    proveedor.fallan.add("roto@example.com")
    with caplog.at_level(logging.DEBUG):
        resultado = await _job(cliente)
    assert "privado@example.com" not in caplog.text
    assert "roto@example.com" not in caplog.text
    assert "p***@example.com" in caplog.text
    fila = await sesion.scalar(select(Auditoria).where(Auditoria.accion == "notificaciones.job"))
    assert fila is not None and fila.usuario_id is None
    assert fila.datos == resultado


async def test_pago_posterior_cancela_y_no_se_envia(
    sesion: AsyncSession, cliente: AsyncClient, proveedor: ProveedorFalso, hoy: date
) -> None:
    """Una notificación cancelada (RN-63) cuenta como omitida y no se envía."""
    m = await _con_membresia(sesion, 3)
    sesion.add(
        Notificacion(
            membresia_id=m.id,
            tipo=TipoNotificacion.RECORDATORIO,
            canal=CanalNotificacion.EMAIL,
            programada_para=HOY,
            estado=EstadoNotificacion.CANCELADA,
        )
    )
    await sesion.flush()
    resultado = await _job(cliente)
    assert resultado == {
        "fecha": "2026-11-10", "creadas": 0, "enviadas": 0, "fallidas": 0, "omitidas": 1
    }  # fmt: skip
    assert proveedor.enviados == []
