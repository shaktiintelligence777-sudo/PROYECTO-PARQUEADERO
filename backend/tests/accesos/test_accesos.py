"""B-04 · accesos: entradas, salidas e historial."""

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime, timedelta

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.seguridad import crear_access_token, hash_password
from app.db.sesion import obtener_sesion
from app.db.tipos import Rol
from app.main import crear_app
from app.modules.accesos.models import Estancia
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.motos.models import Moto
from tests import fabricas
from tests.conftest import cabeceras

# 2026-11-10 07:00 en Bogotá (UTC-5). Debe ser anterior a la hora real: pyjwt compara `iat` con
# el reloj del sistema y rechaza tokens emitidos “en el futuro”.
AHORA = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
HOY = date(2026, 11, 10)


async def _moto(sesion: AsyncSession, placa: str) -> Moto:
    moto = await sesion.scalar(select(Moto).where(Moto.placa == placa))
    assert moto is not None
    return moto


async def _abiertas(sesion: AsyncSession, moto_id: object) -> int:
    return (
        await sesion.scalar(
            select(func.count())
            .select_from(Estancia)
            .where(Estancia.moto_id == moto_id, Estancia.salida_en.is_(None))
        )
        or 0
    )


async def test_ca1_entrada_con_membresia_activa(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    reloj_fijo: Callable[[datetime], None],
) -> None:
    reloj_fijo(AHORA)
    c = await fabricas.cliente(sesion, placas=("ABC12D",))
    await fabricas.membresia(sesion, c.id, await fabricas.plan(sesion), HOY + timedelta(days=20))
    r = await cliente.post(
        "/accesos/entrada", json={"placa": "abc-12d"}, headers=cabeceras_operador
    )
    assert r.status_code == 201
    cuerpo = r.json()
    assert cuerpo["estancia"]["salida_en"] is None
    assert cuerpo["estancia"]["moto"]["placa"] == "ABC12D"
    assert cuerpo["estancia"]["operador_salida"] is None
    assert cuerpo["membresia"]["estado"] == "activa"
    assert cuerpo["advertencias"] == []


async def test_ca2_entrada_repetida_da_409(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    c = await fabricas.cliente(sesion, placas=("ABC12D",))
    moto = await _moto(sesion, "ABC12D")
    assert c.id == moto.cliente_id
    primera = await cliente.post(
        "/accesos/entrada", json={"placa": "ABC12D"}, headers=cabeceras_operador
    )
    r = await cliente.post("/accesos/entrada", json={"placa": "ABC12D"}, headers=cabeceras_operador)
    assert primera.status_code == 201
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "moto_ya_dentro"
    assert await _abiertas(sesion, moto.id) == 1


async def test_ca3_entradas_simultaneas_una_gana(motor: AsyncEngine) -> None:
    """Dos sesiones reales y distintas. Los datos se confirman (no hay transacción envolvente) y al
    final se limpian estancias, motos y clientes; el operador y su auditoría quedan, porque
    `auditoria` es de solo inserción (el esquema se reconstruye en cada ejecución)."""
    placa = "CON123"
    async with AsyncSession(motor, expire_on_commit=False) as s:
        operador = Usuario(
            email="concurrencia@parqueadero.app",
            password_hash=hash_password("contraseña-segura-123"),
            nombre="Operador concurrente",
            rol=Rol.OPERADOR,
        )
        s.add(operador)
        c = await fabricas.cliente(s, placas=(placa,))
        await s.commit()
        cliente_id, operador_id = c.id, operador.id
    cabeceras = {"Authorization": f"Bearer {crear_access_token(operador_id, 'operador').token}"}

    app: FastAPI = crear_app()

    async def _sesion_propia() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(motor, expire_on_commit=False, autoflush=False) as propia:
            yield propia

    app.dependency_overrides[obtener_sesion] = _sesion_propia
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test/api/v1",
        ) as http:
            respuestas = await asyncio.gather(
                *(
                    http.post("/accesos/entrada", json={"placa": placa}, headers=cabeceras)
                    for _ in range(2)
                )
            )
        assert sorted(r.status_code for r in respuestas) == [201, 409]
        perdedora = next(r for r in respuestas if r.status_code == 409)
        assert perdedora.json()["error"]["codigo"] == "moto_ya_dentro"
    finally:
        async with AsyncSession(motor) as s:
            await s.execute(
                delete(Estancia).where(
                    Estancia.moto_id.in_(select(Moto.id).where(Moto.cliente_id == cliente_id))
                )
            )
            await s.execute(delete(Moto).where(Moto.cliente_id == cliente_id))
            await s.execute(delete(Cliente).where(Cliente.id == cliente_id))
            await s.commit()


async def test_ca4_placa_inexistente_moto_o_cliente_inactivos(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, placas=("MOT001",))
    (await _moto(sesion, "MOT001")).activo = False
    inactivo = await fabricas.cliente(sesion, placas=("CLI001",), activo=False)
    assert inactivo.activo is False
    await sesion.flush()
    for placa in ("NOEXIS", "MOT001", "CLI001"):
        for metodo, ruta in (("POST", "/accesos/entrada"), ("POST", "/accesos/salida")):
            r = await cliente.request(
                metodo, ruta, json={"placa": placa}, headers=cabeceras_operador
            )
            assert r.status_code == 404, (placa, ruta)
            assert r.json()["error"]["codigo"] == "moto_no_registrada"
        r = await cliente.get(
            "/accesos/consulta", params={"placa": placa}, headers=cabeceras_operador
        )
        assert r.status_code == 404
        assert r.json()["error"]["codigo"] == "moto_no_registrada"


async def test_ca5_advertencias_segun_membresia(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    reloj_fijo(AHORA)
    plan = await fabricas.plan(sesion)
    escenarios = {
        "VEN001": (HOY - timedelta(days=1), False, ["membresia_vencida"]),
        "POR001": (HOY + timedelta(days=2), False, ["membresia_por_vencer"]),
        "CAN001": (HOY + timedelta(days=20), True, ["sin_membresia"]),
        "SIN001": (None, False, ["sin_membresia"]),
    }
    for placa, (vence, cancelada, _) in escenarios.items():
        c = await fabricas.cliente(sesion, placas=(placa,))
        if vence is not None:
            await fabricas.membresia(
                sesion, c.id, plan, vence, cancelada_por=usuario_admin if cancelada else None
            )
    for placa, (_, _, esperado) in escenarios.items():
        r = await cliente.post(
            "/accesos/entrada", json={"placa": placa}, headers=cabeceras_operador
        )
        assert r.status_code == 201, placa
        assert r.json()["advertencias"] == esperado, placa
    # la membresía cancelada no se muestra como membresía vigente
    assert r.json()["membresia"] is None


async def test_ca6_salida_calcula_duracion(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_admin: Usuario,
    usuario_operador: Usuario,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    reloj_fijo(AHORA)
    await fabricas.cliente(sesion, placas=("ABC12D",))
    await fabricas.dentro(sesion, (await _moto(sesion, "ABC12D")).id, usuario_admin)
    reloj_fijo(AHORA + timedelta(minutes=135, seconds=40))
    # El token dura 15 min: se emite uno nuevo con el reloj ya avanzado.
    r = await cliente.post(
        "/accesos/salida", json={"placa": "ABC12D"}, headers=cabeceras(usuario_operador)
    )
    assert r.status_code == 200
    e = r.json()["estancia"]
    assert e["salida_en"] is not None
    assert e["duracion_minutos"] == 135
    assert e["operador_entrada"]["id"] == str(usuario_admin.id)
    assert e["operador_salida"]["id"] == str(usuario_operador.id)
    assert r.json()["advertencias"] == []


async def test_ca7_salida_de_moto_fuera_da_409(
    sesion: AsyncSession, cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    await fabricas.cliente(sesion, placas=("ABC12D",))
    r = await cliente.post("/accesos/salida", json={"placa": "ABC12D"}, headers=cabeceras_operador)
    assert r.status_code == 409
    assert r.json()["error"]["codigo"] == "moto_no_esta_dentro"


async def test_ca8_consulta_refleja_si_esta_dentro(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
) -> None:
    await fabricas.cliente(sesion, placas=("ABC12D", "XYZ99Z"))
    await fabricas.dentro(sesion, (await _moto(sesion, "ABC12D")).id, usuario_operador)
    dentro = await cliente.get(
        "/accesos/consulta", params={"placa": "abc 12d"}, headers=cabeceras_operador
    )
    fuera = await cliente.get(
        "/accesos/consulta", params={"placa": "XYZ99Z"}, headers=cabeceras_operador
    )
    assert dentro.status_code == fuera.status_code == 200
    assert dentro.json()["estancia_abierta"] is not None
    assert dentro.json()["moto"]["dentro"] is True
    assert fuera.json()["estancia_abierta"] is None
    assert fuera.json()["advertencias"] == ["sin_membresia"]


async def test_ca9_placa_invalida_da_422(
    cliente: AsyncClient, cabeceras_operador: dict[str, str]
) -> None:
    for ruta in ("/accesos/entrada", "/accesos/salida"):
        r = await cliente.post(ruta, json={"placa": "a b"}, headers=cabeceras_operador)
        assert r.status_code == 422
        assert r.json()["error"]["codigo"] == "validacion"
        assert r.json()["error"]["detalles"][0]["campo"] == "placa"
    # Larga y con símbolos: pasa el largo pero no el formato tras normalizar.
    r = await cliente.post("/accesos/entrada", json={"placa": "ab#12d"}, headers=cabeceras_operador)
    assert r.status_code == 422
    r = await cliente.get(
        "/accesos/consulta", params={"placa": "ab#12d"}, headers=cabeceras_operador
    )
    assert r.status_code == 422
    assert r.json()["error"]["detalles"][0]["campo"] == "placa"
    # Campos adicionales no permitidos.
    r = await cliente.post(
        "/accesos/entrada",
        json={"placa": "ABC12D", "entrada_en": "2020-01-01T00:00:00Z"},
        headers=cabeceras_operador,
    )
    assert r.status_code == 422


async def test_ca10_motos_dentro_ordenadas_con_capacidad(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    await sesion.execute(
        Configuracion.__table__.update().where(Configuracion.id == 1).values(capacidad=40)
    )
    await fabricas.cliente(sesion, placas=("AAA111", "BBB222", "CCC333"))
    # Entran en desorden de placas: el orden esperado es por hora de entrada.
    for minuto, placa in ((0, "CCC333"), (10, "AAA111"), (20, "BBB222")):
        reloj_fijo(AHORA + timedelta(minutes=minuto))
        await fabricas.dentro(sesion, (await _moto(sesion, placa)).id, usuario_operador)
    reloj_fijo(AHORA + timedelta(minutes=30))
    r = await cliente.get("/accesos/dentro", headers=cabeceras_operador)
    assert r.status_code == 200
    cuerpo = r.json()
    assert [i["moto"]["placa"] for i in cuerpo["items"]] == ["CCC333", "AAA111", "BBB222"]
    assert (cuerpo["total"], cuerpo["capacidad"]) == (3, 40)
    assert cuerpo["items"][0]["duracion_minutos"] == 30
    filtrada = await cliente.get(
        "/accesos/dentro", params={"placa": "aa"}, headers=cabeceras_operador
    )
    assert [i["moto"]["placa"] for i in filtrada.json()["items"]] == ["AAA111"]


async def test_ca11_historial_por_dia_en_bogota(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
    reloj_fijo: Callable[[datetime], None],
) -> None:
    await fabricas.cliente(sesion, placas=("NOC001", "NOC002"))
    # 23:30 del día 9 y 00:30 del día 10, hora de Bogotá (UTC-5).
    reloj_fijo(datetime(2026, 11, 10, 4, 30, tzinfo=UTC))
    await fabricas.dentro(sesion, (await _moto(sesion, "NOC001")).id, usuario_admin)
    reloj_fijo(datetime(2026, 11, 10, 5, 30, tzinfo=UTC))
    await fabricas.dentro(sesion, (await _moto(sesion, "NOC002")).id, usuario_admin)
    r = await cliente.get(
        "/accesos/historial",
        params={"desde": "2026-11-10", "hasta": "2026-11-10"},
        headers=cabeceras_admin,
    )
    assert r.status_code == 200
    assert [i["moto"]["placa"] for i in r.json()["items"]] == ["NOC002"]
    assert r.json()["total"] == 1
    todo = await cliente.get(
        "/accesos/historial",
        params={"desde": "2026-11-09", "hasta": "2026-11-10"},
        headers=cabeceras_admin,
    )
    # entrada_en descendente
    assert [i["moto"]["placa"] for i in todo.json()["items"]] == ["NOC002", "NOC001"]


async def test_ca12_historial_filtra_por_operador_de_entrada_o_salida(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_admin: dict[str, str],
    usuario_admin: Usuario,
    usuario_operador: Usuario,
    crear_usuario: Callable[..., object],
    reloj_fijo: Callable[[datetime], None],
) -> None:
    otro = await crear_usuario(email="otro@parqueadero.app")
    await fabricas.cliente(sesion, placas=("OP0001", "OP0002", "OP0003"))
    reloj_fijo(AHORA)
    entrada = await fabricas.dentro(sesion, (await _moto(sesion, "OP0001")).id, usuario_operador)
    entrada.salida_en, entrada.operador_salida = AHORA + timedelta(hours=1), otro.id  # type: ignore[attr-defined]
    await fabricas.dentro(sesion, (await _moto(sesion, "OP0002")).id, otro)  # type: ignore[arg-type]
    solo_admin = await fabricas.dentro(sesion, (await _moto(sesion, "OP0003")).id, usuario_admin)
    assert solo_admin.operador_entrada == usuario_admin.id
    await sesion.flush()
    r = await cliente.get(
        "/accesos/historial",
        params={"operador_id": str(otro.id)},
        headers=cabeceras_admin,  # type: ignore[attr-defined]
    )
    assert r.status_code == 200
    assert {i["moto"]["placa"] for i in r.json()["items"]} == {"OP0001", "OP0002"}
    r = await cliente.get(
        "/accesos/historial",
        params={"operador_id": str(usuario_operador.id)},
        headers=cabeceras_admin,
    )
    assert {i["moto"]["placa"] for i in r.json()["items"]} == {"OP0001"}


async def test_ca13_permisos_del_historial_y_sesion_obligatoria(
    cliente: AsyncClient, cabeceras_operador: dict[str, str], cabeceras_admin: dict[str, str]
) -> None:
    assert (await cliente.get("/accesos/historial", headers=cabeceras_operador)).status_code == 403
    assert (await cliente.get("/accesos/historial", headers=cabeceras_admin)).status_code == 200
    sin_token = [
        await cliente.get("/accesos/consulta", params={"placa": "ABC12D"}),
        await cliente.post("/accesos/entrada", json={"placa": "ABC12D"}),
        await cliente.post("/accesos/salida", json={"placa": "ABC12D"}),
        await cliente.get("/accesos/dentro"),
        await cliente.get("/accesos/historial"),
    ]
    assert [r.status_code for r in sin_token] == [401] * 5


async def test_ca14_auditoria_de_entrada_y_salida(
    sesion: AsyncSession,
    cliente: AsyncClient,
    cabeceras_operador: dict[str, str],
    usuario_operador: Usuario,
) -> None:
    await fabricas.cliente(sesion, placas=("ABC12D",))
    entrada = await cliente.post(
        "/accesos/entrada", json={"placa": "ABC12D"}, headers=cabeceras_operador
    )
    salida = await cliente.post(
        "/accesos/salida", json={"placa": "ABC12D"}, headers=cabeceras_operador
    )
    estancia_id = entrada.json()["estancia"]["id"]
    assert salida.json()["estancia"]["id"] == estancia_id
    filas = (
        await sesion.scalars(
            select(Auditoria).where(Auditoria.entidad_id == uuid.UUID(estancia_id))
        )
    ).all()
    assert sorted(f.accion for f in filas) == ["acceso.entrada", "acceso.salida"]
    for f in filas:
        assert str(f.entidad_id) == estancia_id
        assert f.usuario_id == usuario_operador.id
        assert f.datos["placa"] == "ABC12D"
