"""Las reglas de integridad críticas viven en la base de datos, no solo en el código."""

from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.modules.accesos.models import Estancia
from app.modules.auditoria.service import registrar
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import EstadoMembresia, Membresia
from app.modules.motos.models import Moto, normalizar_placa
from app.modules.pagos.models import MetodoPago, Pago
from app.modules.planes.models import Plan


@pytest.fixture
def datos(db, crear_usuario):
    operador = crear_usuario()
    cliente = Cliente(nombre="Ana", documento="123")
    plan = Plan(nombre="Mensual", duracion_dias=30, precio=60000)
    db.add_all([cliente, plan])
    db.flush()
    moto = Moto(cliente_id=cliente.id, placa="ABC12D")
    db.add(moto)
    db.flush()
    return {"operador": operador, "cliente": cliente, "plan": plan, "moto": moto}


def _falla_integridad(db, objeto):
    db.add(objeto)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_una_sola_estancia_abierta_por_moto(db, datos):
    db.add(Estancia(moto_id=datos["moto"].id, operador_entrada=datos["operador"].id))
    db.flush()
    _falla_integridad(db, Estancia(moto_id=datos["moto"].id, operador_entrada=datos["operador"].id))


def test_estancia_cerrada_permite_nueva_entrada(db, datos):
    e = Estancia(moto_id=datos["moto"].id, operador_entrada=datos["operador"].id)
    db.add(e)
    db.flush()
    db.refresh(e)
    e.salida_en = e.entrada_en + timedelta(hours=1)
    e.operador_salida = datos["operador"].id
    db.flush()
    db.add(Estancia(moto_id=datos["moto"].id, operador_entrada=datos["operador"].id))
    db.flush()


def test_salida_requiere_operador(db, datos):
    e = Estancia(moto_id=datos["moto"].id, operador_entrada=datos["operador"].id)
    db.add(e)
    db.flush()
    db.refresh(e)
    e.salida_en = e.entrada_en + timedelta(hours=1)
    with pytest.raises(IntegrityError):
        db.flush()


def test_placa_debe_estar_normalizada(db, datos):
    _falla_integridad(db, Moto(cliente_id=datos["cliente"].id, placa="abc-12d"))


def test_normalizar_placa():
    assert normalizar_placa(" abc-12d ") == "ABC12D"


def test_placa_unica_entre_motos_vigentes(db, datos):
    _falla_integridad(db, Moto(cliente_id=datos["cliente"].id, placa="ABC12D"))


def test_placa_reutilizable_tras_borrado_logico(db, datos):
    datos["moto"].eliminado_en = db.scalar(text("SELECT now()"))
    db.flush()
    db.add(Moto(cliente_id=datos["cliente"].id, placa="ABC12D"))
    db.flush()


def test_documento_unico_entre_clientes_vigentes(db, datos):
    _falla_integridad(db, Cliente(nombre="Otra", documento="123"))


def test_una_membresia_vigente_por_cliente(db, datos):
    hoy = date.today()
    base = {"cliente_id": datos["cliente"].id, "plan_id": datos["plan"].id}
    db.add(Membresia(**base, fecha_inicio=hoy, fecha_vencimiento=hoy + timedelta(days=29)))
    db.flush()
    _falla_integridad(
        db, Membresia(**base, fecha_inicio=hoy, fecha_vencimiento=hoy + timedelta(days=29))
    )


def test_membresia_cancelada_no_bloquea_una_nueva(db, datos):
    hoy = date.today()
    base = {"cliente_id": datos["cliente"].id, "plan_id": datos["plan"].id}
    db.add(
        Membresia(
            **base,
            fecha_inicio=hoy,
            fecha_vencimiento=hoy,
            estado=EstadoMembresia.CANCELADA,
        )
    )
    db.add(Membresia(**base, fecha_inicio=hoy, fecha_vencimiento=hoy + timedelta(days=29)))
    db.flush()


def test_membresia_fechas_ordenadas(db, datos):
    hoy = date.today()
    _falla_integridad(
        db,
        Membresia(
            cliente_id=datos["cliente"].id,
            plan_id=datos["plan"].id,
            fecha_inicio=hoy,
            fecha_vencimiento=hoy - timedelta(days=1),
        ),
    )


def test_pago_monto_positivo(db, datos):
    hoy = date.today()
    m = Membresia(
        cliente_id=datos["cliente"].id,
        plan_id=datos["plan"].id,
        fecha_inicio=hoy,
        fecha_vencimiento=hoy + timedelta(days=29),
    )
    db.add(m)
    db.flush()
    _falla_integridad(
        db,
        Pago(
            membresia_id=m.id,
            monto=0,
            metodo=MetodoPago.EFECTIVO,
            periodo_desde=hoy,
            periodo_hasta=hoy,
            registrado_por=datos["operador"].id,
        ),
    )


def test_estado_fuera_del_catalogo_es_rechazado_por_la_bd(db, datos):
    with pytest.raises(IntegrityError):
        db.execute(text("INSERT INTO planes (nombre, duracion_dias, precio) VALUES ('X', 0, 1000)"))


def test_auditoria_es_de_solo_insercion(db):
    fila = registrar(db, accion="crear", entidad="prueba", datos={"password": "no", "a": 1})
    db.flush()
    assert fila.datos == {"a": 1}  # las claves sensibles se descartan
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE auditoria SET accion = 'otra' WHERE id = :id"), {"id": fila.id})
    db.rollback()
    registrar(db, accion="crear", entidad="prueba")
    db.flush()
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM auditoria"))
