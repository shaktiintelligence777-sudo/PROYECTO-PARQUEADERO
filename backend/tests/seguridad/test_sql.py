"""C-03 · CA-5: no hay SQL construido con formato de cadenas en `backend/app`.

Dos capas: la regla S608 de ruff (activa en CI con `ruff check`) y una revisión del árbol
sintáctico que además cubre `text()`, `execute()` y `exec_driver_sql()` con cualquier sentencia,
no solo las que empiezan por SELECT/INSERT/UPDATE/DELETE.
"""

import ast
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

DIR_BACKEND = Path(__file__).resolve().parents[2]
DIR_APP = DIR_BACKEND / "app"
FUNCIONES_SQL = {"text", "execute", "exec_driver_sql"}


def _es_cadena_construida(nodo: ast.expr) -> bool:
    if isinstance(nodo, ast.JoinedStr):  # f"..."
        return any(isinstance(v, ast.FormattedValue) for v in nodo.values)
    if isinstance(nodo, ast.BinOp) and isinstance(nodo.op, ast.Add | ast.Mod):  # "a" + b, "%s" % b
        return True
    return (
        isinstance(nodo, ast.Call)
        and isinstance(nodo.func, ast.Attribute)
        and nodo.func.attr in {"format", "join"}
    )


def _nombre(func: ast.expr) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def sql_construido(codigo: str) -> list[int]:
    lineas = []
    for nodo in ast.walk(ast.parse(codigo)):
        if (
            isinstance(nodo, ast.Call)
            and _nombre(nodo.func) in FUNCIONES_SQL
            and nodo.args
            and _es_cadena_construida(nodo.args[0])
        ):
            lineas.append(nodo.lineno)
    return lineas


def test_ca5_detector_reconoce_los_patrones() -> None:
    assert sql_construido('text(f"SELECT * FROM t WHERE a = {x}")') == [1]
    assert sql_construido('s.execute("TRUNCATE " + ", ".join(t))') == [1]
    assert sql_construido('c.exec_driver_sql("DELETE FROM %s" % t)') == [1]
    assert sql_construido('text("SELECT {}".format(x))') == [1]
    assert sql_construido('text("SELECT 1")') == []
    assert sql_construido("s.execute(select(T).where(T.a == x))") == []


def test_ca5_sin_sql_construido_con_cadenas_en_app() -> None:
    hallazgos = [
        f"{archivo.relative_to(DIR_BACKEND)}:{linea}"
        for archivo in sorted(DIR_APP.rglob("*.py"))
        for linea in sql_construido(archivo.read_text(encoding="utf-8"))
    ]
    assert hallazgos == []


def test_ca5_regla_de_lint_activa() -> None:
    config = tomllib.loads((DIR_BACKEND / "pyproject.toml").read_text(encoding="utf-8"))
    lint = config["tool"]["ruff"]["lint"]
    assert "S" in lint["select"]
    assert "S608" not in lint.get("ignore", [])
    assert "S608" not in str(config["tool"]["ruff"]["lint"].get("per-file-ignores", {}))

    ruff = shutil.which("ruff") or str(Path(sys.executable).with_name("ruff"))
    resultado = subprocess.run(  # noqa: S603 - ejecutable y argumentos fijos
        [ruff, "check", "--select", "S608", "--no-cache", "app"],
        cwd=DIR_BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stdout
