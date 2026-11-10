"""Plantillas de los avisos (RN-65). Funciones puras.

Las variables se sustituyen recorriendo la plantilla con `string.Formatter.parse`, nunca con
`str.format`: así una plantilla no puede leer atributos (`{nombre.__class__}`) y los valores
se insertan como texto plano.
"""

from collections.abc import Mapping
from datetime import date
from string import Formatter

VARIABLES = frozenset({"nombre", "plan", "fecha_vencimiento", "precio", "parqueadero"})

MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)  # fmt: skip


class PlantillaInvalida(ValueError):
    pass


def _partes(texto: str) -> list[tuple[str, str | None]]:
    try:
        crudas = list(Formatter().parse(texto))
    except ValueError as exc:
        raise PlantillaInvalida("La plantilla tiene llaves sin cerrar.") from exc
    partes: list[tuple[str, str | None]] = []
    for literal, campo, formato, conversion in crudas:
        if campo is not None and (campo not in VARIABLES or formato or conversion):
            permitidas = ", ".join("{" + v + "}" for v in sorted(VARIABLES))
            raise PlantillaInvalida(f"Variable desconocida: {{{campo}}}. Usa solo {permitidas}.")
        partes.append((literal, campo))
    return partes


def validar_plantilla(texto: str) -> str:
    """Devuelve el texto si solo usa variables conocidas; si no, lanza `PlantillaInvalida`."""
    _partes(texto)
    return texto


def renderizar(texto: str, valores: Mapping[str, str]) -> str:
    return "".join(literal + (valores[campo] if campo else "") for literal, campo in _partes(texto))


def formato_fecha(fecha: date) -> str:
    """`11 de noviembre de 2026`."""
    return f"{fecha.day} de {MESES[fecha.month - 1]} de {fecha.year}"


def formato_precio(valor: int) -> str:
    """`$60.000` (pesos colombianos, separador de miles con punto)."""
    return "$" + f"{valor:,}".replace(",", ".")


def valores(
    *, nombre: str, plan: str, fecha_vencimiento: date, precio: int, parqueadero: str
) -> dict[str, str]:
    return {
        "nombre": nombre,
        "plan": plan,
        "fecha_vencimiento": formato_fecha(fecha_vencimiento),
        "precio": formato_precio(precio),
        "parqueadero": parqueadero,
    }
