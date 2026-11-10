"""B-02 · normalización de placas (RN-01)."""

import pytest

from app.core.placas import normalizar_placa


@pytest.mark.parametrize(
    ("entrada", "esperada"),
    [("abc-12d", "ABC12D"), ("ABC 12D", "ABC12D"), (" xyz98e ", "XYZ98E"), ("ab12", "AB12")],
)
def test_ca14_normaliza(entrada: str, esperada: str) -> None:
    assert normalizar_placa(entrada) == esperada


@pytest.mark.parametrize("entrada", ["a b", "ABCDEFGH", "AB_12", "ÑAB12", ""])
def test_ca14_rechaza_formatos_invalidos(entrada: str) -> None:
    with pytest.raises(ValueError):
        normalizar_placa(entrada)
