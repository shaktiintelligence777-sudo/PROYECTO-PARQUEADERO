"""Importa todos los modelos para que queden registrados en Base.metadata (lo usa Alembic)."""

from app.db.base import Base
from app.modules.accesos.models import Estancia
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import IntentoLogin, RefreshToken
from app.modules.clientes.models import Cliente
from app.modules.membresias.models import Membresia
from app.modules.motos.models import Moto
from app.modules.notificaciones.models import Notificacion
from app.modules.pagos.models import Pago
from app.modules.planes.models import Plan
from app.modules.usuarios.models import Usuario

__all__ = [
    "Auditoria",
    "Base",
    "Cliente",
    "Estancia",
    "IntentoLogin",
    "Membresia",
    "Moto",
    "Notificacion",
    "Pago",
    "Plan",
    "RefreshToken",
    "Usuario",
]
