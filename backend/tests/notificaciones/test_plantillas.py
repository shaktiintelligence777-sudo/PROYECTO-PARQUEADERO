"""B-07 · plantillas (RN-65) y selección por fecha (RN-60)."""

from datetime import date, timedelta

import pytest

from app.db.tipos import TipoNotificacion
from app.jobs.notificaciones import tipo_para
from app.modules.configuracion.models import PLANTILLAS_POR_DEFECTO
from app.modules.notificaciones.plantillas import (
    PlantillaInvalida,
    formato_fecha,
    formato_precio,
    renderizar,
    validar_plantilla,
    valores,
)

HOY = date(2026, 11, 10)


def test_ca10_validar_plantilla() -> None:
    with pytest.raises(PlantillaInvalida, match="apellido"):
        validar_plantilla("Hola {apellido}")
    assert validar_plantilla("Hola {nombre}") == "Hola {nombre}"


@pytest.mark.parametrize(
    "texto",
    ["{nombre.__class__}", "{nombre!r}", "{precio:>10}", "{0}", "{}", "Hola {nombre", "}"],
)
def test_rechaza_accesos_formatos_y_llaves_rotas(texto: str) -> None:
    with pytest.raises(PlantillaInvalida):
        validar_plantilla(texto)


def test_todas_las_variables_y_llaves_escapadas() -> None:
    texto = "{nombre} {plan} {fecha_vencimiento} {precio} {parqueadero} {{literal}}"
    v = {k: k.upper() for k in ("nombre", "plan", "fecha_vencimiento", "precio", "parqueadero")}
    assert renderizar(texto, v) == "NOMBRE PLAN FECHA_VENCIMIENTO PRECIO PARQUEADERO {literal}"


def test_valores_se_insertan_como_texto_plano() -> None:
    assert renderizar("Hola {nombre}", {"nombre": "{plan} <b>"}) == "Hola {plan} <b>"


@pytest.mark.parametrize(
    ("fecha", "texto"),
    [
        (date(2026, 11, 11), "11 de noviembre de 2026"),
        (date(2027, 1, 1), "1 de enero de 2027"),
        (date(2028, 2, 29), "29 de febrero de 2028"),
    ],
)
def test_formato_fecha(fecha: date, texto: str) -> None:
    assert formato_fecha(fecha) == texto


@pytest.mark.parametrize(
    ("valor", "texto"), [(60000, "$60.000"), (1000000, "$1.000.000"), (500, "$500")]
)
def test_formato_precio(valor: int, texto: str) -> None:
    assert formato_precio(valor) == texto


def test_ca9_plantillas_por_defecto_sin_llaves() -> None:
    v = valores(
        nombre="Ana Pérez",
        plan="Mensual",
        fecha_vencimiento=date(2026, 11, 11),
        precio=60000,
        parqueadero="Parqueadero Central",
    )
    for texto in PLANTILLAS_POR_DEFECTO.values():
        validar_plantilla(texto)
        resultado = renderizar(texto, v)
        assert "{" not in resultado and "}" not in resultado
    cuerpo = renderizar(PLANTILLAS_POR_DEFECTO["plantilla_recordatorio_cuerpo"], v)
    for esperado in ("Ana Pérez", "Mensual", "11 de noviembre de 2026", "$60.000"):
        assert esperado in cuerpo


@pytest.mark.parametrize(
    ("dias", "esperado"),
    [
        (3, TipoNotificacion.RECORDATORIO),
        (1, TipoNotificacion.RECORDATORIO),
        (0, TipoNotificacion.RECORDATORIO),
        (2, None),
        (4, None),
        (-1, TipoNotificacion.VENCIDA),
        (-2, None),
    ],
)
def test_seleccion_por_fecha(dias: int, esperado: TipoNotificacion | None) -> None:
    assert tipo_para(HOY + timedelta(days=dias), HOY, [3, 1, 0]) == esperado


def test_seleccion_con_dias_configurados() -> None:
    assert tipo_para(HOY + timedelta(days=5), HOY, [5]) == TipoNotificacion.RECORDATORIO
    assert tipo_para(HOY + timedelta(days=3), HOY, [5]) is None
