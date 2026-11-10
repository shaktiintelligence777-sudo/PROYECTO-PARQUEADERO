"""B-02 · las reglas críticas las garantiza la base de datos."""

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import pytest
from alembic import command
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import reloj
from app.core.auditoria import registrar_auditoria, sanear
from app.db.tipos import CanalNotificacion, MetodoPago, Rol, TipoNotificacion
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.models import Membresia
from app.modules.motos.models import Moto
from app.modules.notificaciones.models import Notificacion
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan
from tests.conftest import config_alembic

HOY = date(2026, 11, 10)


@pytest.fixture
async def datos(sesion: AsyncSession, crear_usuario: Callable[..., Any]) -> dict[str, Any]:
    operador = await crear_usuario()
    cliente = Cliente(nombre="Ana Torres", documento="900000001", telefono="3000000001")
    plan = Plan(nombre="Mensual", duracion_dias=30, precio=60000)
    sesion.add_all([cliente, plan])
    await sesion.flush()
    moto = Moto(cliente_id=cliente.id, placa="ABC12D")
    sesion.add(moto)
    await sesion.flush()
    return {"operador": operador, "cliente": cliente, "plan": plan, "moto": moto}


async def _falla(sesion: AsyncSession, *objetos: object) -> None:
    with pytest.raises(IntegrityError):
        async with sesion.begin_nested():
            sesion.add_all(objetos)
            await sesion.flush()


def _membresia(d: dict[str, Any], **extra: Any) -> Membresia:
    return Membresia(
        cliente_id=d["cliente"].id,
        plan_id=d["plan"].id,
        fecha_inicio=HOY,
        fecha_vencimiento=HOY + timedelta(days=29),
        **extra,
    )


def _pago(d: dict[str, Any], membresia: Membresia, **extra: Any) -> Pago:
    valores: dict[str, Any] = {
        "membresia_id": membresia.id,
        "plan_id": d["plan"].id,
        "monto": 60000,
        "metodo": MetodoPago.EFECTIVO,
        "periodos": 1,
        "periodo_desde": HOY,
        "periodo_hasta": HOY + timedelta(days=29),
        "registrado_por": d["operador"].id,
        **extra,
    }
    return Pago(**valores)


async def test_ca1_doce_tablas_y_fila_de_configuracion(sesion: AsyncSession) -> None:
    tablas = await sesion.scalar(
        text(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name <> 'alembic_version'"
        )
    )
    assert tablas == 12
    config = await sesion.get(Configuracion, 1)
    assert config is not None
    assert config.dias_por_vencer == 3
    assert config.dias_recordatorio == [3, 1, 0]
    assert "{parqueadero}" in config.plantilla_recordatorio_asunto


def test_ca2_downgrade_y_upgrade_sin_error() -> None:
    cfg = config_alembic()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def test_ca3_alembic_check_sin_diferencias() -> None:
    command.check(config_alembic())


async def test_ca4_una_estancia_abierta_por_moto(
    sesion: AsyncSession, datos: dict[str, Any]
) -> None:
    entrada = {"moto_id": datos["moto"].id, "operador_entrada": datos["operador"].id}
    sesion.add(Estancia(**entrada, entrada_en=reloj.ahora()))
    await sesion.flush()
    await _falla(sesion, Estancia(**entrada, entrada_en=reloj.ahora()))


async def test_ca5_estancia_cerrada_permite_nueva_entrada(
    sesion: AsyncSession, datos: dict[str, Any]
) -> None:
    ahora = reloj.ahora()
    entrada = {"moto_id": datos["moto"].id, "operador_entrada": datos["operador"].id}
    sesion.add(
        Estancia(
            **entrada,
            entrada_en=ahora - timedelta(hours=2),
            salida_en=ahora - timedelta(hours=1),
            operador_salida=datos["operador"].id,
        )
    )
    sesion.add(Estancia(**entrada, entrada_en=ahora))
    await sesion.flush()


async def test_salida_exige_operador(sesion: AsyncSession, datos: dict[str, Any]) -> None:
    ahora = reloj.ahora()
    await _falla(
        sesion,
        Estancia(
            moto_id=datos["moto"].id,
            operador_entrada=datos["operador"].id,
            entrada_en=ahora,
            salida_en=ahora,
        ),
    )


async def test_ca6_una_membresia_no_cancelada_por_cliente(
    sesion: AsyncSession, datos: dict[str, Any]
) -> None:
    primera = _membresia(datos)
    sesion.add(primera)
    await sesion.flush()
    await _falla(sesion, _membresia(datos))

    primera.cancelada_en = reloj.ahora()
    primera.cancelada_por = datos["operador"].id
    primera.motivo_cancelacion = "Prueba"
    await sesion.flush()
    sesion.add(_membresia(datos))
    await sesion.flush()


async def test_cancelacion_debe_estar_completa(sesion: AsyncSession, datos: dict[str, Any]) -> None:
    await _falla(sesion, _membresia(datos, cancelada_en=reloj.ahora()))


@pytest.mark.parametrize("placa", ["abc12d", "AB-12", "ABCDEFGH"])
async def test_ca7_check_de_placa(sesion: AsyncSession, datos: dict[str, Any], placa: str) -> None:
    await _falla(sesion, Moto(cliente_id=datos["cliente"].id, placa=placa))


async def test_ca8_email_unico_sin_distinguir_mayusculas(
    sesion: AsyncSession, crear_usuario: Callable[..., Any]
) -> None:
    await crear_usuario(email="Ana@x.co")
    await _falla(
        sesion, Usuario(email="ana@x.co", password_hash="x", nombre="Ana", rol=Rol.OPERADOR)
    )


async def test_ca9_pago_monto_cero_o_anulacion_incompleta(
    sesion: AsyncSession, datos: dict[str, Any]
) -> None:
    membresia = _membresia(datos)
    sesion.add(membresia)
    await sesion.flush()
    await _falla(sesion, _pago(datos, membresia, monto=0))
    await _falla(sesion, _pago(datos, membresia, anulado_en=reloj.ahora()))
    sesion.add(_pago(datos, membresia))
    await sesion.flush()


async def test_ca10_notificacion_unica(sesion: AsyncSession, datos: dict[str, Any]) -> None:
    membresia = _membresia(datos)
    sesion.add(membresia)
    await sesion.flush()

    def aviso() -> Notificacion:
        return Notificacion(
            membresia_id=membresia.id,
            tipo=TipoNotificacion.RECORDATORIO,
            canal=CanalNotificacion.EMAIL,
            programada_para=HOY,
        )

    sesion.add(aviso())
    await sesion.flush()
    await _falla(sesion, aviso())


async def test_ca11_no_se_borra_un_cliente_con_motos(
    sesion: AsyncSession, datos: dict[str, Any]
) -> None:
    with pytest.raises(IntegrityError):
        async with sesion.begin_nested():
            await sesion.delete(datos["cliente"])
            await sesion.flush()


async def test_documento_y_placa_unicos(sesion: AsyncSession, datos: dict[str, Any]) -> None:
    await _falla(sesion, Cliente(nombre="Otra", documento="900000001", telefono="3000000002"))
    await _falla(sesion, Moto(cliente_id=datos["cliente"].id, placa="ABC12D"))


async def test_indice_de_busqueda_sin_tildes(sesion: AsyncSession, datos: dict[str, Any]) -> None:
    datos["cliente"].nombre = "Andrés Gómez"
    await sesion.flush()
    encontrados = await sesion.scalars(
        select(Cliente.nombre).where(func.lower(func.f_unaccent(Cliente.nombre)) == "andres gomez")
    )
    assert encontrados.all() == ["Andrés Gómez"]


def test_ca15_auditoria_sanea_claves_sensibles_a_cualquier_profundidad() -> None:
    datos = {"password": "x", "sub": {"refresh_token": "y", "nombre": "Ana"}}
    assert sanear(datos) == {"sub": {"nombre": "Ana"}}


async def test_ca15_lo_guardado_en_auditoria_esta_saneado(sesion: AsyncSession) -> None:
    fila = await registrar_auditoria(
        sesion,
        usuario_id=None,
        accion="prueba.crear",
        entidad="prueba",
        datos={"password": "x", "sub": {"refresh_token": "y", "nombre": "Ana"}},
    )
    await sesion.refresh(fila)
    assert fila.datos == {"sub": {"nombre": "Ana"}}


async def test_auditoria_es_de_solo_insercion(sesion: AsyncSession) -> None:
    fila = await registrar_auditoria(sesion, usuario_id=None, accion="a", entidad="prueba")
    with pytest.raises(DBAPIError):
        async with sesion.begin_nested():
            await sesion.execute(
                text("UPDATE auditoria SET accion = 'b' WHERE id = :id"), {"id": fila.id}
            )
    with pytest.raises(DBAPIError):
        async with sesion.begin_nested():
            await sesion.execute(text("DELETE FROM auditoria WHERE id = :id"), {"id": fila.id})
