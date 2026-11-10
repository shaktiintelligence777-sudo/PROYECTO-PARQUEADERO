"""Semilla de la base de datos.

    python -m app.db.seed            # crea el administrador inicial (SEED_ADMIN_*)
    python -m app.db.seed --demo     # además, datos ficticios para desarrollo (no en producción)

Es idempotente: si los registros ya existen, no los duplica.
"""

import argparse
import os
import sys
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import get_sessionmaker
from app.modules.auditoria.service import registrar
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import Membresia
from app.modules.motos.models import Moto
from app.modules.planes.models import Plan
from app.modules.usuarios.models import Rol, Usuario

LONGITUD_MINIMA_PASSWORD = 12


def _usuario(db: Session, email: str, password: str, nombre: str, rol: Rol) -> Usuario:
    existente = db.scalar(select(Usuario).where(func.lower(Usuario.email) == email.lower()))
    if existente:
        print(f"· Usuario {email} ya existe; no se modifica.")
        return existente
    usuario = Usuario(
        email=email.lower(), password_hash=hash_password(password), nombre=nombre, rol=rol
    )
    db.add(usuario)
    db.flush()
    registrar(
        db, accion="crear", entidad="usuario", entidad_id=usuario.id, datos={"origen": "seed"}
    )
    print(f"✓ Usuario {email} ({rol.value}) creado.")
    return usuario


def sembrar_admin(db: Session) -> Usuario:
    email = os.environ.get("SEED_ADMIN_EMAIL", "").strip()
    password = os.environ.get("SEED_ADMIN_PASSWORD", "")
    nombre = os.environ.get("SEED_ADMIN_NOMBRE", "Administrador")
    if not email or len(password) < LONGITUD_MINIMA_PASSWORD:
        sys.exit(
            "Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD "
            f"(mínimo {LONGITUD_MINIMA_PASSWORD} caracteres)."
        )
    return _usuario(db, email, password, nombre, Rol.ADMIN)


def sembrar_demo(db: Session) -> None:
    """Datos ficticios para desarrollo local. Precios y nombres son inventados."""
    _usuario(db, "operador@parqueadero.app", "operador-demo-1234", "Operador Demo", Rol.OPERADOR)

    planes = {}
    for nombre, dias, precio in [("Mensual", 30, 60000), ("Quincenal", 15, 35000)]:
        plan = db.scalar(select(Plan).where(Plan.nombre == nombre))
        if plan is None:
            plan = Plan(nombre=nombre, duracion_dias=dias, precio=precio)
            db.add(plan)
        planes[nombre] = plan
    db.flush()

    hoy = db.scalar(select(func.current_date()))
    clientes = [
        ("Ana Pérez", "1000000001", "ABC12D", "Yamaha", "Azul", "Mensual", 20),
        ("Luis Gómez", "1000000002", "XYZ98E", "Honda", "Negro", "Quincenal", 2),
        ("Marta Ruiz", "1000000003", "JKL45F", "Suzuki", "Rojo", "Mensual", -3),
    ]
    for nombre, doc, placa, marca, color, plan_nombre, dias_restantes in clientes:
        if db.scalar(select(Cliente).where(Cliente.documento == doc)):
            continue
        cliente = Cliente(nombre=nombre, documento=doc, telefono="3000000000")
        db.add(cliente)
        db.flush()
        db.add(Moto(cliente_id=cliente.id, placa=placa, marca=marca, color=color))
        plan = planes[plan_nombre]
        vence = hoy + timedelta(days=dias_restantes)
        db.add(
            Membresia(
                cliente_id=cliente.id,
                plan_id=plan.id,
                fecha_inicio=vence - timedelta(days=plan.duracion_dias - 1),
                fecha_vencimiento=vence,
            )
        )
    print("✓ Datos de demostración listos.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="agrega datos ficticios")
    args = parser.parse_args()

    if args.demo and get_settings().entorno == "produccion":
        sys.exit("--demo no está permitido en producción.")

    with get_sessionmaker()() as db:
        sembrar_admin(db)
        if args.demo:
            sembrar_demo(db)
        db.commit()


if __name__ == "__main__":
    main()
