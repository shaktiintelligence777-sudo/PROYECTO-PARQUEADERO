"""Normalización de placas (RN-01)."""

import re

_PATRON = re.compile(r"^[A-Z0-9]{4,7}$")


def normalizar_placa(texto: str) -> str:
    """Mayúsculas, sin espacios ni guiones. Lanza ValueError si no cumple ^[A-Z0-9]{4,7}$."""
    placa = re.sub(r"[\s\-]", "", texto).upper()
    if not _PATRON.fullmatch(placa):
        raise ValueError("La placa debe tener de 4 a 7 letras o números.")
    return placa
