"""Lectura de `contracts/openapi.yaml` para las pruebas de seguridad de C-03.

Las pruebas se generan recorriendo el contrato: una operación nueva entra sola en la matriz y,
si no está protegida, CI falla.
"""

import re
import uuid
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import yaml

RUTA_CONTRATO = Path(__file__).resolve().parents[3] / "contracts" / "openapi.yaml"
PREFIJO = "/api/v1"
METODOS = ("get", "post", "put", "patch", "delete")

# Operaciones del contrato cuyas specs todavía no se han construido. Cuando una de ellas llega
# a `main`, `test_ca3_pendientes_al_dia` obliga a quitarla de aquí, y desde ese momento entra en
# la matriz de permisos (CA-1 y CA-2) y en la comparación de rutas (CA-3).
PENDIENTES: dict[str, str] = {
    "exportarHistorialAccesos": "B-08",
    "resumenDashboard": "B-08",
    "listarUsuarios": "B-10",
    "crearUsuario": "B-10",
    "editarUsuario": "B-10",
    "obtenerConfiguracion": "B-10",
    "editarConfiguracion": "B-10",
}


@dataclass(frozen=True)
class Operacion:
    id: str
    metodo: str
    ruta: str  # con el prefijo /api/v1 y los parámetros tal como los nombra el contrato
    esquemas: tuple[str, ...]  # bearerAuth, serviceToken o vacío si es pública
    roles: tuple[str, ...]  # x-roles; vacío = admin y operador

    @property
    def clave(self) -> tuple[str, str]:
        return self.metodo.upper(), normalizar(self.ruta)

    @property
    def solo_admin(self) -> bool:
        return self.roles == ("admin",)

    def url_de_prueba(self) -> str:
        """Ruta sin el prefijo y con un uuid cualquiera en cada parámetro."""
        return re.sub(r"\{[^}]+\}", str(uuid.uuid4()), self.ruta.removeprefix(PREFIJO))

    def __str__(self) -> str:
        return f"{self.metodo.upper()} {self.ruta} ({self.id})"


def normalizar(ruta: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", ruta)


@cache
def contrato() -> dict[str, Any]:
    datos = yaml.safe_load(RUTA_CONTRATO.read_text(encoding="utf-8"))
    assert isinstance(datos, dict)
    return datos


@cache
def operaciones() -> tuple[Operacion, ...]:
    c = contrato()
    seguridad_global = c.get("security", [])
    resultado = []
    for ruta, item in c["paths"].items():
        for metodo in METODOS:
            op = item.get(metodo)
            if op is None:
                continue
            seguridad = op.get("security", seguridad_global)
            esquemas = tuple(sorted({nombre for req in seguridad for nombre in req}))
            resultado.append(
                Operacion(
                    id=op["operationId"],
                    metodo=metodo,
                    ruta=PREFIJO + ruta,
                    esquemas=esquemas,
                    roles=tuple(op.get("x-roles", ())),
                )
            )
    return tuple(resultado)


def construidas() -> list[Operacion]:
    return [op for op in operaciones() if op.id not in PENDIENTES]
