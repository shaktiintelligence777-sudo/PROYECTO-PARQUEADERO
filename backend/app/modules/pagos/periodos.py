"""Periodo cubierto por un pago (RN-41). Función pura: solo fechas de calendario."""

from datetime import date, timedelta


def calcular_periodo(
    fecha_vencimiento: date, hoy: date, duracion_dias: int, periodos: int
) -> tuple[date, date]:
    """Devuelve `(desde, hasta)`.

    Si la membresía aún no ha vencido (incluido el día exacto del vencimiento), el periodo
    empieza el día siguiente al vencimiento y no se pierden días (CB-2). Si ya venció, empieza
    hoy y no se cobra la mora (CB-3).
    """
    desde = fecha_vencimiento + timedelta(days=1) if hoy <= fecha_vencimiento else hoy
    hasta = desde + timedelta(days=duracion_dias * periodos - 1)
    return desde, hasta
