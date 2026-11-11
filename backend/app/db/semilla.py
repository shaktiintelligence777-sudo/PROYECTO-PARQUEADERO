"""Semilla de datos ficticios para desarrollo y demo (docs/dominio.md §6).

    python -m app.db.semilla               # siembra si la base está vacía (idempotente)
    python -m app.db.semilla --reiniciar   # vacía las tablas y vuelve a sembrar

Se niega a ejecutarse con ENTORNO=produccion. Las fechas son relativas a `reloj.hoy()` para que
siempre existan membresías en los cuatro estados.
"""

import argparse
import asyncio
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import reloj
from app.core.auditoria import registrar_auditoria
from app.core.config import Ajustes, obtener_ajustes
from app.core.seguridad import hash_password
from app.db.tipos import MetodoPago, Rol
from app.modules.accesos.models import Estancia
from app.modules.auth.models import Usuario
from app.modules.clientes.models import Cliente
from app.modules.configuracion.models import Configuracion
from app.modules.membresias.models import Membresia
from app.modules.motos.models import Moto
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan

PASSWORD_DEMO = "demo1234"  # noqa: S105 - credencial pública del demo (D-11), nunca en producción

# Todas las tablas excepto `configuracion`, como sentencia literal: no se construye SQL con
# cadenas ni siquiera a partir de constantes (C-03, CA-5).
SQL_VACIAR = text(
    "TRUNCATE auditoria, notificaciones, pagos, estancias, membresias, motos, clientes, planes,"
    " refresh_tokens, intentos_login, usuarios RESTART IDENTITY CASCADE"
)


class SemillaEnProduccion(RuntimeError):
    pass


@dataclass(frozen=True)
class ClienteSemilla:
    nombre: str
    email: str | None
    placas: tuple[str, ...]
    plan: str | None  # None = sin membresía
    vence_en: int = 0  # días desde hoy hasta fecha_vencimiento
    renovado_hoy: bool = False  # el último pago es de hoy y renovó antes de vencer
    nuevo_hoy: bool = False  # la membresía empezó hoy con su pago inicial
    pago_anulado: bool = False  # tiene un segundo pago anulado
    cancelada: bool = False
    marcas: tuple[str, ...] = field(default=("Honda",))


PLANES = (("Mensual", 30, 60000), ("Quincenal", 15, 35000), ("Semanal", 7, 18000))

# 6 activas, 2 por vencer, 2 vencidas, 1 cancelada y 1 sin membresía (dias_por_vencer = 3).
CLIENTES = (
    ClienteSemilla("Ana Torres", "ana.torres@example.com", ("ABC12D", "XYZ34E"), "Mensual", 20),
    ClienteSemilla("Luis Ramírez", "luis.ramirez@example.com", ("BCD23E",), "Mensual", 29,
                   nuevo_hoy=True),
    ClienteSemilla("Carmen Díaz", "carmen.diaz@example.com", ("CDE34F",), "Quincenal", 10),
    ClienteSemilla("Jorge Castro", "jorge.castro@example.com", ("DEF45G",), "Semanal", 5),
    ClienteSemilla("Paola Rojas", "paola.rojas@example.com", ("EFG56H", "FGH67J"), "Mensual", 32,
                   renovado_hoy=True),
    ClienteSemilla("Andrés Moreno", None, ("GHJ78K",), "Mensual", 15),
    ClienteSemilla("Sofía Herrera", "sofia.herrera@example.com", ("HJK89L",), "Quincenal", 2),
    ClienteSemilla("Diego Vargas", "diego.vargas@example.com", ("JKL90M",), "Mensual", 0),
    ClienteSemilla("Valentina Gómez", "valentina.gomez@example.com", ("KLM01N",), "Mensual", -5,
                   pago_anulado=True),
    ClienteSemilla("Camilo Jiménez", "camilo.jimenez@example.com", ("LMN12P",), "Semanal", -12),
    ClienteSemilla("Laura Medina", "laura.medina@example.com", ("MNP23Q",), "Mensual", 8,
                   cancelada=True),
    ClienteSemilla("Mateo Silva", "mateo.silva@example.com", ("NPQ34R",), None),
)  # fmt: skip

MARCAS = ("Honda", "Yamaha", "Suzuki", "AKT", "Bajaj", "TVS")
COLORES = ("Negro", "Rojo", "Azul", "Blanco", "Gris")
# Motos dentro ahora: (placa, horas desde la entrada). Una lleva más de 24 horas (CB-5).
DENTRO = (("ABC12D", 1.5), ("CDE34F", 3), ("HJK89L", 0.5), ("KLM01N", 26), ("NPQ34R", 5))


def _instante(dia: date, hora: int, minuto: int = 0) -> datetime:
    """Hora local de Bogotá convertida a UTC."""
    return datetime.combine(dia, time(hora, minuto), tzinfo=reloj.zona()).astimezone(reloj.UTC)


async def _usuario(sesion: AsyncSession, email: str, nombre: str, rol: Rol) -> Usuario:
    existente = await sesion.scalar(select(Usuario).where(func.lower(Usuario.email) == email))
    if existente:
        return existente
    usuario = Usuario(
        email=email, nombre=nombre, rol=rol, password_hash=hash_password(PASSWORD_DEMO)
    )
    sesion.add(usuario)
    await sesion.flush()
    return usuario


async def sembrar(sesion: AsyncSession) -> bool:
    """Siembra los datos de demostración. Devuelve False si ya estaban (no duplica nada)."""
    hoy, ahora = reloj.hoy(), reloj.ahora()
    admin = await _usuario(sesion, "demo@parqueadero.app", "Usuario Demo", Rol.ADMIN)
    operador = await _usuario(sesion, "operador@parqueadero.app", "Operador Demo", Rol.OPERADOR)

    if await sesion.scalar(select(func.count()).select_from(Cliente)):
        await sesion.commit()
        return False

    config = await sesion.get(Configuracion, 1)
    assert config is not None  # la crea la migración  # noqa: S101
    config.nombre_parqueadero = "Parqueadero Demo"
    config.capacidad = 40
    config.dias_por_vencer = 3
    config.dias_recordatorio = [3, 1, 0]

    planes: dict[str, Plan] = {}
    for nombre, dias, precio in PLANES:
        planes[nombre] = Plan(nombre=nombre, duracion_dias=dias, precio=precio)
        sesion.add(planes[nombre])
    await sesion.flush()

    motos: dict[str, Moto] = {}
    for i, c in enumerate(CLIENTES, start=1):
        cliente = Cliente(
            nombre=c.nombre,
            documento=f"9000000{i:02d}",
            telefono=f"30000000{i:02d}",
            email=c.email,
        )
        sesion.add(cliente)
        await sesion.flush()
        for j, placa in enumerate(c.placas):
            motos[placa] = Moto(
                cliente_id=cliente.id,
                placa=placa,
                marca=MARCAS[(i + j) % len(MARCAS)],
                color=COLORES[(i + j) % len(COLORES)],
            )
            sesion.add(motos[placa])
        if c.plan is not None:
            await _membresia(sesion, c, cliente.id, planes[c.plan], admin, operador, hoy, ahora)
    await sesion.flush()

    # Estancias abiertas y unas 30 cerradas en los últimos 7 días, en motos que no están dentro.
    dentro = {placa for placa, _ in DENTRO}
    for k, (placa, horas) in enumerate(DENTRO):
        sesion.add(
            Estancia(
                moto_id=motos[placa].id,
                entrada_en=ahora - timedelta(hours=horas),
                operador_entrada=(operador if k % 2 else admin).id,
            )
        )
    afuera = [m for p, m in motos.items() if p not in dentro]
    for k in range(30):
        dia = hoy - timedelta(days=1 + k % 7)
        entrada = _instante(dia, 6 + (k * 5) % 12, (k * 17) % 60)
        sesion.add(
            Estancia(
                moto_id=afuera[k % len(afuera)].id,
                entrada_en=entrada,
                salida_en=entrada + timedelta(hours=1 + (k * 3) % 9, minutes=(k * 11) % 60),
                operador_entrada=(operador if k % 3 else admin).id,
                operador_salida=(admin if k % 4 == 0 else operador).id,
            )
        )

    await registrar_auditoria(sesion, usuario_id=None, accion="semilla.ejecutar", entidad="sistema")
    await sesion.commit()
    return True


async def _membresia(
    sesion: AsyncSession,
    c: ClienteSemilla,
    cliente_id: uuid.UUID,
    plan: Plan,
    admin: Usuario,
    operador: Usuario,
    hoy: date,
    ahora: datetime,
) -> None:
    """Crea la membresía y una cadena de pagos coherente con RN-41/RN-42/RN-46."""
    vence = hoy + timedelta(days=c.vence_en)
    d = plan.duracion_dias
    # Vencimiento antes del último pago vigente (si renovó hoy).
    vence_previo = vence - timedelta(days=d) if c.renovado_hoy else vence
    inicio = hoy if c.nuevo_hoy else vence_previo - timedelta(days=d - 1)

    membresia = Membresia(
        cliente_id=cliente_id,
        plan_id=plan.id,
        fecha_inicio=inicio,
        fecha_vencimiento=vence,
    )
    if c.cancelada:
        membresia.cancelada_en = ahora - timedelta(days=1)
        membresia.cancelada_por = admin.id
        membresia.motivo_cancelacion = "El cliente se mudó de ciudad."
    sesion.add(membresia)
    await sesion.flush()

    def pago(desde: date, anterior: date | None, creado: datetime, **extra: object) -> Pago:
        return Pago(
            membresia_id=membresia.id,
            plan_id=plan.id,
            monto=plan.precio,
            metodo=MetodoPago.EFECTIVO if desde.day % 2 else MetodoPago.TRANSFERENCIA,
            periodos=1,
            periodo_desde=desde,
            periodo_hasta=desde + timedelta(days=d - 1),
            vencimiento_anterior=anterior,
            registrado_por=operador.id,
            creado_en=creado,
            **extra,
        )

    inicial_creado = ahora - timedelta(minutes=40) if c.nuevo_hoy else _instante(inicio, 9)
    sesion.add(pago(inicio, None, inicial_creado))
    if c.renovado_hoy:
        sesion.add(pago(vence_previo + timedelta(days=1), vence_previo, ahora - timedelta(hours=2)))
    if c.pago_anulado:
        creado = _instante(vence - timedelta(days=1), 17)
        sesion.add(
            pago(
                vence + timedelta(days=1),
                vence,
                creado,
                anulado_en=creado + timedelta(minutes=10),
                anulado_por=admin.id,
                motivo_anulacion="Pago registrado dos veces por error.",
            )
        )


async def reiniciar(sesion: AsyncSession) -> None:
    """Vacía todas las tablas excepto `configuracion`. TRUNCATE no dispara el trigger de
    `auditoria` (que bloquea UPDATE y DELETE fila a fila)."""
    await sesion.execute(SQL_VACIAR)
    await sesion.commit()


async def ejecutar(
    ajustes: Ajustes, fabrica: async_sessionmaker[AsyncSession], vaciar: bool = False
) -> bool:
    if ajustes.entorno == "produccion":
        raise SemillaEnProduccion("La semilla no se puede ejecutar con ENTORNO=produccion.")
    async with fabrica() as sesion:
        if vaciar:
            await reiniciar(sesion)
        return await sembrar(sesion)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reiniciar", action="store_true", help="vacía las tablas y resiembra")
    args = parser.parse_args()

    from app.db.sesion import obtener_fabrica_sesiones

    try:
        sembro = asyncio.run(
            ejecutar(obtener_ajustes(), obtener_fabrica_sesiones(), args.reiniciar)
        )
    except SemillaEnProduccion as exc:
        sys.exit(str(exc))
    print("Semilla aplicada." if sembro else "La base ya tenía datos; no se modificó nada.")


if __name__ == "__main__":
    main()
