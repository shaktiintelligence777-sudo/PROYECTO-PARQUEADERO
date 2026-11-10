"""B-06 · membresías: alta, cambio de plan, cancelación y listado."""

from collections.abc import Callable
from datetime import date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tipos import CanalNotificacion, EstadoNotificacion, TipoNotificacion
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.models import Membresia
from app.modules.notificaciones.models import Notificacion
from app.modules.pagos.models import Pago
from tests import fabricas
from tests.pagos.apoyo import HOY, alta, codigo, fijar_hoy

Reloj = Callable[[datetime], None]


async def test_ca1_alta_con_pago_inicial(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion, nombre="Mensual", dias=30)
    c = await fabricas.cliente(sesion, placas=("ABC12D",))
    r = await alta(cliente, cabeceras_operador, c.id, plan.id, fecha_inicio="2026-11-10")
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["fecha_inicio"] == "2026-11-10"
    assert cuerpo["fecha_vencimiento"] == "2026-12-09"
    assert cuerpo["estado"] == "activa"
    assert cuerpo["dias_restantes"] == 29
    assert cuerpo["placas"] == ["ABC12D"]
    assert cuerpo["cliente"]["id"] == str(c.id)
    assert cuerpo["plan"]["nombre"] == "Mensual"
    assert cuerpo["cancelada_en"] is None

    pagos = list(await sesion.scalars(select(Pago).where(Pago.membresia_id == cuerpo["id"])))
    assert len(pagos) == 1
    p = pagos[0]
    assert (p.periodo_desde, p.periodo_hasta) == (date(2026, 11, 10), date(2026, 12, 9))
    assert p.periodos == 1 and p.vencimiento_anterior is None and p.monto == 60000
    acciones = set(
        await sesion.scalars(select(Auditoria.accion).where(Auditoria.entidad_id == cuerpo["id"]))
    )
    assert acciones == {"membresia.crear"}


async def test_alta_fecha_inicio_por_defecto_hoy(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion, dias=15)
    c = await fabricas.cliente(sesion)
    r = await alta(cliente, cabeceras_operador, c.id, plan.id)
    assert r.status_code == 201
    assert r.json()["fecha_inicio"] == "2026-11-10"
    assert r.json()["fecha_vencimiento"] == "2026-11-24"


async def test_ca2_una_membresia_no_cancelada_por_cliente(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    assert (await alta(cliente, cabeceras_operador, c.id, plan.id)).status_code == 201
    r = await alta(cliente, cabeceras_operador, c.id, plan.id)
    assert r.status_code == 409
    assert codigo(r) == "membresia_existente"

    otro = await fabricas.cliente(sesion)
    await fabricas.membresia(sesion, otro.id, plan, HOY, cancelada_por=usuario_admin)
    assert (await alta(cliente, cabeceras_operador, otro.id, plan.id)).status_code == 201


async def test_ca3_plan_inactivo_en_alta_y_cambio_de_plan(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    activo = await fabricas.plan(sesion)
    inactivo = await fabricas.plan(sesion, activo=False)
    c = await fabricas.cliente(sesion)
    r = await alta(cliente, cabeceras_operador, c.id, inactivo.id)
    assert r.status_code == 409 and codigo(r) == "plan_inactivo"

    m = await fabricas.membresia(sesion, c.id, activo, HOY + timedelta(days=5))
    r = await cliente.patch(
        f"/membresias/{m.id}", json={"plan_id": str(inactivo.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 409 and codigo(r) == "plan_inactivo"


@pytest.mark.parametrize("desfase", [-40, 40, -32, 32])
async def test_ca4_fecha_inicio_fuera_de_rango(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
    desfase: int,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    inicio = (HOY + timedelta(days=desfase)).isoformat()
    r = await alta(cliente, cabeceras_operador, c.id, plan.id, fecha_inicio=inicio)
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "fecha_inicio"


@pytest.mark.parametrize("desfase", [-31, 31])
async def test_ca4_fecha_inicio_en_el_limite(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
    desfase: int,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    inicio = (HOY + timedelta(days=desfase)).isoformat()
    r = await alta(cliente, cabeceras_operador, c.id, plan.id, fecha_inicio=inicio)
    assert r.status_code == 201


async def test_ca10_alta_monto_distinto_exige_nota(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion, precio=60000)
    c = await fabricas.cliente(sesion)
    r = await alta(cliente, cabeceras_operador, c.id, plan.id, monto=50000)
    assert r.status_code == 422
    assert r.json()["error"]["codigo"] == "validacion"
    assert r.json()["error"]["detalles"][0]["campo"] == "pago_inicial.nota"
    r = await alta(cliente, cabeceras_operador, c.id, plan.id, monto=50000, pago={"nota": "   "})
    assert r.status_code == 422
    r = await alta(
        cliente, cabeceras_operador, c.id, plan.id, monto=50000, pago={"nota": "Descuento"}
    )
    assert r.status_code == 201


async def test_alta_cliente_inexistente_o_inactivo(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion)
    inactivo = await fabricas.cliente(sesion, activo=False)
    r = await alta(cliente, cabeceras_operador, inactivo.id, plan.id)
    assert r.status_code == 404
    r = await alta(cliente, cabeceras_operador, plan.id, plan.id)
    assert r.status_code == 404


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"pago_inicial": {"monto": 0, "metodo": "efectivo"}},
        {"pago_inicial": {"monto": 100_000_001, "metodo": "efectivo"}},
        {"pago_inicial": {"monto": "60000", "metodo": "efectivo"}},
        {"pago_inicial": {"monto": 60000, "metodo": "cheque"}},
        {"pago_inicial": {"monto": 60000, "metodo": "efectivo", "extra": 1}},
        {"extra": 1},
    ],
)
async def test_alta_validaciones(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    cuerpo: dict[str, object],
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    base = {
        "cliente_id": str(c.id),
        "plan_id": str(plan.id),
        "pago_inicial": {"monto": 60000, "metodo": "efectivo"},
    }
    r = await cliente.post("/membresias", json={**base, **cuerpo}, headers=cabeceras_operador)
    assert r.status_code == 422


async def test_ca12_cambio_de_plan_en_membresia_cancelada(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
) -> None:
    plan = await fabricas.plan(sesion)
    otro = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY, cancelada_por=usuario_admin)
    r = await cliente.patch(
        f"/membresias/{m.id}", json={"plan_id": str(otro.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 409 and codigo(r) == "membresia_cancelada"


async def test_cambio_de_plan_conserva_vencimiento_y_audita(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    mensual = await fabricas.plan(sesion, dias=30)
    quincenal = await fabricas.plan(sesion, dias=15, precio=35000)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, mensual, HOY + timedelta(days=20))
    r = await cliente.patch(
        f"/membresias/{m.id}", json={"plan_id": str(quincenal.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 200
    assert r.json()["plan"]["id"] == str(quincenal.id)
    assert r.json()["fecha_vencimiento"] == (HOY + timedelta(days=20)).isoformat()
    accion = Auditoria.accion == "membresia.cambiar_plan"
    fila = await sesion.scalar(select(Auditoria).where(accion))
    assert fila is not None
    assert fila.datos["plan_anterior"] == str(mensual.id)
    assert fila.datos["plan_nuevo"] == str(quincenal.id)

    r = await cliente.patch(f"/membresias/{m.id}", json={}, headers=cabeceras_operador)
    assert r.status_code == 422
    r = await cliente.patch(
        f"/membresias/{m.id}", json={"plan_id": str(c.id)}, headers=cabeceras_operador
    )
    assert r.status_code == 404


async def test_ca13_operador_no_cancela(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY)
    r = await cliente.post(
        f"/membresias/{m.id}/cancelar", json={"motivo": "Se fue"}, headers=cabeceras_operador
    )
    assert r.status_code == 403
    assert (await sesion.get(Membresia, m.id)).cancelada_en is None  # type: ignore[union-attr]


async def test_ca17_cancelar_cancela_notificaciones_pendientes(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY + timedelta(days=3))
    pendiente = Notificacion(
        membresia_id=m.id,
        tipo=TipoNotificacion.RECORDATORIO,
        canal=CanalNotificacion.EMAIL,
        programada_para=HOY + timedelta(days=1),
    )
    enviada = Notificacion(
        membresia_id=m.id,
        tipo=TipoNotificacion.RECORDATORIO,
        canal=CanalNotificacion.WHATSAPP,
        programada_para=HOY,
        estado=EstadoNotificacion.ENVIADA,
    )
    sesion.add_all([pendiente, enviada])
    await sesion.flush()

    r = await cliente.post(
        f"/membresias/{m.id}/cancelar",
        json={"motivo": "  Se mudó de ciudad  "},
        headers=cabeceras_admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "cancelada"
    assert r.json()["motivo_cancelacion"] == "Se mudó de ciudad"
    assert r.json()["cancelada_en"] is not None
    await sesion.refresh(pendiente)
    await sesion.refresh(enviada)
    assert pendiente.estado == EstadoNotificacion.CANCELADA
    assert enviada.estado == EstadoNotificacion.ENVIADA
    await sesion.refresh(m)
    assert m.cancelada_por == usuario_admin.id
    fila = await sesion.scalar(select(Auditoria).where(Auditoria.accion == "membresia.cancelar"))
    assert fila is not None and fila.datos["motivo"] == "Se mudó de ciudad"

    # Ya cancelada.
    r = await cliente.post(
        f"/membresias/{m.id}/cancelar", json={"motivo": "Otra vez"}, headers=cabeceras_admin
    )
    assert r.status_code == 409 and codigo(r) == "membresia_cancelada"


@pytest.mark.parametrize("motivo", ["", "abc", "x" * 301])
async def test_cancelar_motivo_invalido(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_admin: dict[str, str], motivo: str
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY)
    r = await cliente.post(
        f"/membresias/{m.id}/cancelar", json={"motivo": motivo}, headers=cabeceras_admin
    )
    assert r.status_code == 422


async def test_ca18_listado_por_estado_y_cliente(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Reloj,
) -> None:
    fijar_hoy(reloj_fijo)
    config = await sesion.get(Configuracion, 1)
    assert config is not None
    config.dias_por_vencer = 5
    await sesion.flush()
    plan = await fabricas.plan(sesion)
    ids = {}
    for nombre, vence in [
        ("activa", HOY + timedelta(days=6)),
        ("limite", HOY + timedelta(days=5)),
        ("hoy", HOY),
        ("vencida", HOY - timedelta(days=1)),
    ]:
        c = await fabricas.cliente(sesion, nombre=f"Cliente {nombre}")
        ids[nombre] = str((await fabricas.membresia(sesion, c.id, plan, vence)).id)
    cancelado = await fabricas.cliente(sesion, nombre="Cliente cancelado")
    cancelada = await fabricas.membresia(
        sesion, cancelado.id, plan, HOY + timedelta(days=2), cancelada_por=usuario_admin
    )
    nueva = await fabricas.membresia(sesion, cancelado.id, plan, HOY + timedelta(days=40))

    async def listar(**params: str) -> list[str]:
        r = await cliente.get("/membresias", params=params, headers=cabeceras_operador)
        assert r.status_code == 200, r.text
        return [m["id"] for m in r.json()["items"]]

    assert await listar(estado="por_vencer") == [ids["hoy"], ids["limite"]]
    assert await listar(estado="vencida") == [ids["vencida"]]
    assert await listar(estado="activa") == [ids["activa"], str(nueva.id)]
    assert await listar(estado="cancelada") == [str(cancelada.id)]
    # Sin filtros: sin canceladas, por vencimiento ascendente.
    assert await listar() == [ids["vencida"], ids["hoy"], ids["limite"], ids["activa"],
                              str(nueva.id)]  # fmt: skip
    # Con cliente_id: también las canceladas.
    assert await listar(cliente_id=str(cancelado.id)) == [str(cancelada.id), str(nueva.id)]
    assert await listar(q="cancelado") == [str(nueva.id)]

    r = await cliente.get("/membresias", params={"estado": "otra"}, headers=cabeceras_operador)
    assert r.status_code == 422


async def test_listado_busca_por_placa_y_documento(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion, placas=("XYZ98A",), documento="1020304050")
    m = await fabricas.membresia(sesion, c.id, plan, HOY)
    otro = await fabricas.cliente(sesion)
    await fabricas.membresia(sesion, otro.id, plan, HOY)
    for q in ("xyz-98", "10203"):
        r = await cliente.get("/membresias", params={"q": q}, headers=cabeceras_operador)
        assert [x["id"] for x in r.json()["items"]] == [str(m.id)]
        assert r.json()["total"] == 1


async def test_obtener_membresia(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    plan = await fabricas.plan(sesion)
    c = await fabricas.cliente(sesion)
    m = await fabricas.membresia(sesion, c.id, plan, HOY)
    r = await cliente.get(f"/membresias/{m.id}", headers=cabeceras_operador)
    assert r.status_code == 200 and r.json()["id"] == str(m.id)
    r = await cliente.get(f"/membresias/{c.id}", headers=cabeceras_operador)
    assert r.status_code == 404
    r = await cliente.get(f"/membresias/{m.id}")
    assert r.status_code == 401
    total = await sesion.scalar(select(func.count()).select_from(Membresia))
    assert total
