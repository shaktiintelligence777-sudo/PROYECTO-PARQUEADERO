"""B-06 · pagos: registro, vista previa, anulación y listados."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tipos import CanalNotificacion, EstadoNotificacion, TipoNotificacion
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario
from app.modules.membresias.models import Membresia
from app.modules.notificaciones.models import Notificacion
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan
from tests import fabricas
from tests.pagos.apoyo import AHORA, HOY, alta, codigo, fijar_hoy, pagar

Reloj = Callable[[datetime], None]


async def _membresia(sesion: AsyncSession, vence: date, dias: int = 30) -> tuple[Membresia, Plan]:
    plan = await fabricas.plan(sesion, dias=dias, precio=60000)
    c = await fabricas.cliente(sesion)
    return await fabricas.membresia(sesion, c.id, plan, vence), plan


async def test_ca5_pago_antes_de_vencer_no_pierde_dias(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, plan = await _membresia(sesion, date(2026, 11, 12))
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.status_code == 201, r.text
    pago = r.json()["pago"]
    assert (pago["periodo_desde"], pago["periodo_hasta"]) == ("2026-11-13", "2026-12-12")
    assert r.json()["membresia"]["fecha_vencimiento"] == "2026-12-12"
    assert pago["plan"]["id"] == str(plan.id)
    assert pago["anulado"] is False and pago["anulado_por"] is None
    assert pago["registrado_por"]["nombre"] == "Usuario de prueba"
    assert pago["periodos"] == 1
    fila = await sesion.scalar(select(Pago).where(Pago.id == pago["id"]))
    assert fila is not None and fila.vencimiento_anterior == date(2026, 11, 12)


async def test_ca6_pago_con_membresia_vencida_empieza_hoy(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, _ = await _membresia(sesion, HOY - timedelta(days=10))
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.status_code == 201
    pago = r.json()["pago"]
    assert pago["periodo_desde"] == HOY.isoformat()
    assert pago["periodo_hasta"] == (HOY + timedelta(days=29)).isoformat()
    assert r.json()["membresia"]["estado"] == "activa"


async def test_ca7_tres_periodos_extienden_90_dias(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    vence = HOY + timedelta(days=2)
    m, _ = await _membresia(sesion, vence)
    r = await pagar(cliente, cabeceras_operador, m.id, 180000, periodos=3)
    assert r.status_code == 201
    assert r.json()["membresia"]["fecha_vencimiento"] == (vence + timedelta(days=90)).isoformat()
    assert r.json()["pago"]["periodos"] == 3


async def test_ca8_dia_exacto_del_vencimiento(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, _ = await _membresia(sesion, HOY)
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.json()["pago"]["periodo_desde"] == (HOY + timedelta(days=1)).isoformat()


async def test_ca9_vista_previa_igual_al_pago_y_sin_escrituras(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    vence = HOY + timedelta(days=2)
    m, plan = await _membresia(sesion, vence)
    pagos_antes = await sesion.scalar(select(func.count()).select_from(Pago))
    auditoria_antes = await sesion.scalar(select(func.count()).select_from(Auditoria))
    r = await cliente.post(
        "/pagos/previsualizar",
        json={"membresia_id": str(m.id), "periodos": 2},
        headers=cabeceras_operador,
    )
    assert r.status_code == 200, r.text
    previa = r.json()
    assert previa["membresia_id"] == str(m.id)
    assert previa["plan"]["id"] == str(plan.id)
    assert previa["periodos"] == 2
    assert previa["monto_sugerido"] == 120000
    assert previa["vencimiento_actual"] == vence.isoformat()
    assert await sesion.scalar(select(func.count()).select_from(Pago)) == pagos_antes
    assert await sesion.scalar(select(func.count()).select_from(Auditoria)) == auditoria_antes
    await sesion.refresh(m)
    assert m.fecha_vencimiento == vence

    r = await pagar(cliente, cabeceras_operador, m.id, 120000, periodos=2)
    pago = r.json()["pago"]
    assert pago["periodo_desde"] == previa["periodo_desde"]
    assert pago["periodo_hasta"] == previa["periodo_hasta"]
    assert r.json()["membresia"]["fecha_vencimiento"] == previa["vencimiento_nuevo"]

    # Periodos por defecto: 1.
    r = await cliente.post(
        "/pagos/previsualizar", json={"membresia_id": str(m.id)}, headers=cabeceras_operador
    )
    assert r.json()["periodos"] == 1 and r.json()["monto_sugerido"] == 60000


async def test_ca10_monto_distinto_exige_nota(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, _ = await _membresia(sesion, HOY)
    r = await pagar(cliente, cabeceras_operador, m.id, 50000)
    assert r.status_code == 422
    assert codigo(r) == "validacion"
    assert r.json()["error"]["detalles"] == [
        {"campo": "nota", "mensaje": "Explica por qué el monto es distinto al del plan."}
    ]
    # 2 periodos: el propuesto es 120000, así que 60000 también exige nota.
    r = await pagar(cliente, cabeceras_operador, m.id, 60000, periodos=2)
    assert r.status_code == 422
    r = await pagar(cliente, cabeceras_operador, m.id, 50000, nota="Descuento por referido")
    assert r.status_code == 201
    assert r.json()["pago"]["nota"] == "Descuento por referido"


async def test_ca11_y_ca20_cambio_de_plan_aplica_desde_el_proximo_pago(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    mensual = await fabricas.plan(sesion, nombre="Mensual", dias=30, precio=60000)
    quincenal = await fabricas.plan(sesion, nombre="Quincenal", dias=15, precio=35000)
    c = await fabricas.cliente(sesion)
    r = await alta(cliente, cabeceras_operador, c.id, mensual.id)
    membresia_id = r.json()["id"]
    vence = r.json()["fecha_vencimiento"]

    r = await cliente.patch(
        f"/membresias/{membresia_id}",
        json={"plan_id": str(quincenal.id)},
        headers=cabeceras_operador,
    )
    assert r.status_code == 200
    assert r.json()["fecha_vencimiento"] == vence  # CA-11: no cambia.

    r = await pagar(cliente, cabeceras_operador, membresia_id, 35000)
    assert r.status_code == 201
    nuevo = date.fromisoformat(vence) + timedelta(days=15)
    assert r.json()["membresia"]["fecha_vencimiento"] == nuevo.isoformat()
    assert r.json()["pago"]["plan"]["nombre"] == "Quincenal"

    # CA-20: el pago inicial sigue mostrando el plan Mensual.
    r = await cliente.get(f"/membresias/{membresia_id}/pagos", headers=cabeceras_operador)
    planes = [p["plan"]["nombre"] for p in r.json()["items"]]
    assert planes == ["Quincenal", "Mensual"]


async def test_ca3_plan_inactivo_en_pago_y_vista_previa(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, plan = await _membresia(sesion, HOY + timedelta(days=5))
    plan.activo = False
    await sesion.flush()
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.status_code == 409 and codigo(r) == "plan_inactivo"
    r = await cliente.post(
        "/pagos/previsualizar", json={"membresia_id": str(m.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 409 and codigo(r) == "plan_inactivo"
    # La membresía sigue vigente (CB-13).
    r = await cliente.get(f"/membresias/{m.id}", headers=cabeceras_operador)
    assert r.json()["estado"] == "activa"


async def test_ca12_membresia_cancelada_no_acepta_pagos(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY, cancelada_por=usuario_admin)
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.status_code == 409 and codigo(r) == "membresia_cancelada"
    r = await cliente.post(
        "/pagos/previsualizar", json={"membresia_id": str(m.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 409 and codigo(r) == "membresia_cancelada"


async def test_pago_membresia_inexistente_y_validaciones(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    m, _ = await _membresia(sesion, HOY)
    r = await pagar(cliente, cabeceras_operador, m.cliente_id, 60000)
    assert r.status_code == 404
    for extra in ({"periodos": 0}, {"periodos": 13}, {"metodo": "cheque"}, {"x": 1}):
        r = await pagar(cliente, cabeceras_operador, m.id, 60000, **extra)
        assert r.status_code == 422, extra
    r = await pagar(cliente, cabeceras_operador, m.id, 0)
    assert r.status_code == 422
    r = await pagar(cliente, cabeceras_operador, m.id, 60000, nota="x" * 301)
    assert r.status_code == 422


async def _alta_y_segundo_pago(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras: dict[str, str],
    reloj_fijo: Reloj,
) -> tuple[str, str, str, str]:
    """Membresía con pago inicial (10 nov) y un segundo pago una hora después."""
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion, dias=30, precio=60000)
    c = await fabricas.cliente(sesion)
    r = await alta(cliente, cabeceras, c.id, plan.id)
    membresia_id, vence = r.json()["id"], r.json()["fecha_vencimiento"]
    inicial = await sesion.scalar(select(Pago.id).where(Pago.membresia_id == membresia_id))
    reloj_fijo(AHORA + timedelta(hours=1))
    r = await pagar(cliente, cabeceras, membresia_id, 60000)
    return membresia_id, vence, str(inicial), r.json()["pago"]["id"]


async def test_ca13_operador_no_anula(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    _, _, _, segundo = await _alta_y_segundo_pago(sesion, cliente, cabeceras_operador, reloj_fijo)
    r = await cliente.post(
        f"/pagos/{segundo}/anular", json={"motivo": "Error de digitación"},
        headers=cabeceras_operador,
    )  # fmt: skip
    assert r.status_code == 403


async def test_ca14_ca15_ca21_anular_ultimo_pago(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Reloj,
) -> None:
    membresia_id, vence, inicial, segundo = await _alta_y_segundo_pago(
        sesion, cliente, cabeceras_admin, reloj_fijo
    )
    reloj_fijo(AHORA + timedelta(hours=2))
    motivo = {"motivo": "Se registró dos veces"}

    # CA-15: el pago inicial no se anula.
    r = await cliente.post(f"/pagos/{inicial}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 409 and codigo(r) == "pago_no_anulable"

    # CA-14: anular el segundo restaura el vencimiento.
    r = await cliente.post(f"/pagos/{segundo}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 200, r.text
    assert r.json()["membresia"]["fecha_vencimiento"] == vence
    pago = r.json()["pago"]
    assert pago["anulado"] is True
    assert pago["motivo_anulacion"] == "Se registró dos veces"
    assert pago["anulado_por"] == {"id": str(usuario_admin.id), "nombre": usuario_admin.nombre}
    assert pago["anulado_en"] is not None

    # CA-15: ya anulado.
    r = await cliente.post(f"/pagos/{segundo}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 409 and codigo(r) == "pago_no_anulable"

    # CA-21: auditoría con vencimientos anterior y nuevo.
    registro = await sesion.scalar(
        select(Auditoria).where(
            Auditoria.accion == "pago.registrar", Auditoria.entidad_id == segundo
        )
    )
    anulacion = await sesion.scalar(
        select(Auditoria).where(Auditoria.accion == "pago.anular", Auditoria.entidad_id == segundo)
    )
    assert registro is not None and anulacion is not None
    nuevo = (date.fromisoformat(vence) + timedelta(days=30)).isoformat()
    assert registro.datos["vencimiento_anterior"] == vence
    assert registro.datos["vencimiento_nuevo"] == nuevo
    assert registro.datos["monto"] == 60000
    assert anulacion.datos["vencimiento_anterior"] == nuevo
    assert anulacion.datos["vencimiento_nuevo"] == vence
    assert anulacion.datos["motivo"] == "Se registró dos veces"


async def test_ca15_solo_se_anula_el_ultimo(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str], reloj_fijo: Reloj
) -> None:
    membresia_id, _, _, segundo = await _alta_y_segundo_pago(
        sesion, cliente, cabeceras_admin, reloj_fijo
    )
    reloj_fijo(AHORA + timedelta(hours=2))
    r = await pagar(cliente, cabeceras_admin, membresia_id, 60000)
    tercero = r.json()["pago"]["id"]
    motivo = {"motivo": "Prueba de anulación"}
    r = await cliente.post(f"/pagos/{segundo}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 409 and codigo(r) == "pago_no_anulable"
    # Anulado el tercero, el segundo pasa a ser el último y ya se puede anular.
    r = await cliente.post(f"/pagos/{tercero}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 200
    r = await cliente.post(f"/pagos/{segundo}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 200
    r = await cliente.post(f"/pagos/{membresia_id}/anular", json=motivo, headers=cabeceras_admin)
    assert r.status_code == 404


async def test_ca15_no_se_anula_en_membresia_cancelada(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str], reloj_fijo: Reloj
) -> None:
    membresia_id, _, _, segundo = await _alta_y_segundo_pago(
        sesion, cliente, cabeceras_admin, reloj_fijo
    )
    r = await cliente.post(
        f"/membresias/{membresia_id}/cancelar", json={"motivo": "Se fue"}, headers=cabeceras_admin
    )
    assert r.status_code == 200
    r = await cliente.post(
        f"/pagos/{segundo}/anular", json={"motivo": "Prueba"}, headers=cabeceras_admin
    )
    assert r.status_code == 409 and codigo(r) == "pago_no_anulable"


async def test_ca17_pago_cancela_notificaciones_pendientes(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    m, _ = await _membresia(sesion, HOY + timedelta(days=1))
    aviso = Notificacion(
        membresia_id=m.id,
        tipo=TipoNotificacion.RECORDATORIO,
        canal=CanalNotificacion.EMAIL,
        programada_para=HOY + timedelta(days=1),
    )
    fallida = Notificacion(
        membresia_id=m.id,
        tipo=TipoNotificacion.RECORDATORIO,
        canal=CanalNotificacion.WHATSAPP,
        programada_para=HOY,
        estado=EstadoNotificacion.FALLIDA,
    )
    sesion.add_all([aviso, fallida])
    await sesion.flush()
    r = await pagar(cliente, cabeceras_operador, m.id, 60000)
    assert r.status_code == 201
    await sesion.refresh(aviso)
    await sesion.refresh(fallida)
    assert aviso.estado == EstadoNotificacion.CANCELADA
    assert fallida.estado == EstadoNotificacion.FALLIDA


async def test_ca19_listar_pagos_del_dia_en_bogota(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion, dias=30, precio=60000)
    # Instantes de `creado_en` alrededor de la medianoche de Bogotá (UTC−5).
    momentos = {
        "ayer_noche": datetime(2026, 11, 10, 4, 59, tzinfo=UTC),  # 9 nov 23:59
        "hoy_temprano": datetime(2026, 11, 10, 5, 0, tzinfo=UTC),  # 10 nov 00:00
        "hoy_noche": datetime(2026, 11, 11, 4, 59, tzinfo=UTC),  # 10 nov 23:59
        "manana": datetime(2026, 11, 11, 5, 0, tzinfo=UTC),  # 11 nov 00:00
    }
    ids: dict[str, str] = {}
    clientes: dict[str, Any] = {}
    for nombre, instante in momentos.items():
        c = await fabricas.cliente(sesion)
        metodo = "transferencia" if nombre == "hoy_noche" else "efectivo"
        r = await alta(cliente, cabeceras_admin, c.id, plan.id, pago={"metodo": metodo})
        assert r.status_code == 201, r.text
        pago = await sesion.scalar(select(Pago).where(Pago.membresia_id == r.json()["id"]))
        assert pago is not None
        pago.creado_en = instante
        ids[nombre], clientes[nombre] = str(pago.id), (c.id, r.json()["id"])
    await sesion.flush()

    # Un pago adicional de hoy (10:00 en Bogotá), anulado.
    r = await pagar(cliente, cabeceras_admin, clientes["hoy_temprano"][1], 60000)
    anulado = r.json()["pago"]["id"]
    r = await cliente.post(
        f"/pagos/{anulado}/anular", json={"motivo": "Prueba CA-19"}, headers=cabeceras_admin
    )
    assert r.status_code == 200

    async def listar(**params: Any) -> list[str]:
        r = await cliente.get("/pagos", params=params, headers=cabeceras_admin)
        assert r.status_code == 200, r.text
        return [p["id"] for p in r.json()["items"]]

    hoy = HOY.isoformat()
    assert await listar(desde=hoy, hasta=hoy) == [ids["hoy_noche"], anulado, ids["hoy_temprano"]]
    assert await listar(desde=hoy, hasta=hoy, incluir_anulados="false") == [
        ids["hoy_noche"],
        ids["hoy_temprano"],
    ]
    assert await listar(hasta="2026-11-09") == [ids["ayer_noche"]]
    assert await listar(desde="2026-11-11") == [ids["manana"]]
    assert await listar(metodo="transferencia") == [ids["hoy_noche"]]
    assert await listar(cliente_id=str(clientes["hoy_temprano"][0])) == [
        anulado,
        ids["hoy_temprano"],
    ]
    r = await cliente.get("/pagos", params={"desde": "ayer"}, headers=cabeceras_admin)
    assert r.status_code == 422


async def test_listar_pagos_de_membresia_paginado(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    membresia_id, _, inicial, segundo = await _alta_y_segundo_pago(
        sesion, cliente, cabeceras_operador, reloj_fijo
    )
    r = await cliente.get(
        f"/membresias/{membresia_id}/pagos",
        params={"por_pagina": 1},
        headers=cabeceras_operador,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2
    assert [p["id"] for p in r.json()["items"]] == [segundo]
    r = await cliente.get(
        f"/membresias/{membresia_id}/pagos",
        params={"por_pagina": 1, "pagina": 2},
        headers=cabeceras_operador,
    )
    assert [p["id"] for p in r.json()["items"]] == [inicial]
    r = await cliente.get(f"/membresias/{inicial}/pagos", headers=cabeceras_operador)
    assert r.status_code == 404


@pytest.mark.parametrize("ruta", ["/pagos", "/pagos/previsualizar"])
async def test_pagos_requieren_sesion(cliente: AsyncClient, ruta: str) -> None:
    r = await cliente.post(ruta, json={})
    assert r.status_code == 401
