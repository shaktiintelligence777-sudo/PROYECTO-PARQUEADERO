"""Ayudas para búsquedas con LIKE sin inyección de comodines."""

import re


def escapar_like(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def solo_alfanumerico(texto: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", texto).upper()
