"""B-06 · `calcular_periodo` (RN-41): tabla de casos."""

from datetime import date

import pytest

from app.modules.pagos.periodos import calcular_periodo

D = date


@pytest.mark.parametrize(
    ("vence", "hoy", "dias", "periodos", "esperado"),
    [
        # CB-2: vence el 12, hoy 10 → del 13 al 12 del mes siguiente.
        (D(2026, 11, 12), D(2026, 11, 10), 30, 1, (D(2026, 11, 13), D(2026, 12, 12))),
        # CB-3: vencida hace 10 días → empieza hoy.
        (D(2026, 10, 31), D(2026, 11, 10), 30, 1, (D(2026, 11, 10), D(2026, 12, 9))),
        # CB-4: 3 periodos de 30 días → 90 días.
        (D(2026, 11, 12), D(2026, 11, 10), 30, 3, (D(2026, 11, 13), D(2027, 2, 10))),
        # Día exacto del vencimiento: aún no está vencida.
        (D(2026, 11, 10), D(2026, 11, 10), 30, 1, (D(2026, 11, 11), D(2026, 12, 10))),
        # Vencida ayer.
        (D(2026, 11, 9), D(2026, 11, 10), 15, 1, (D(2026, 11, 10), D(2026, 11, 24))),
        # Fin de mes.
        (D(2026, 1, 31), D(2026, 1, 20), 30, 1, (D(2026, 2, 1), D(2026, 3, 2))),
        # Año bisiesto: 29 de febrero.
        (D(2028, 2, 28), D(2028, 2, 20), 1, 1, (D(2028, 2, 29), D(2028, 2, 29))),
        (D(2028, 2, 10), D(2028, 2, 20), 30, 1, (D(2028, 2, 20), D(2028, 3, 20))),
        # Cambio de año.
        (D(2026, 12, 31), D(2026, 12, 30), 7, 2, (D(2027, 1, 1), D(2027, 1, 14))),
        # Plan de un día, 12 periodos.
        (D(2026, 11, 10), D(2026, 11, 10), 1, 12, (D(2026, 11, 11), D(2026, 11, 22))),
    ],
)
def test_calcular_periodo(
    vence: date, hoy: date, dias: int, periodos: int, esperado: tuple[date, date]
) -> None:
    assert calcular_periodo(vence, hoy, dias, periodos) == esperado
