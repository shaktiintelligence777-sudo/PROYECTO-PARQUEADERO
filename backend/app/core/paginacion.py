"""Paginación común: parámetros `pagina` y `por_pagina` y respuesta `{items, total, pagina,
por_pagina}`."""

from dataclasses import dataclass

from fastapi import Query
from pydantic import BaseModel


@dataclass(frozen=True)
class ParamsPaginacion:
    pagina: int
    por_pagina: int

    @property
    def offset(self) -> int:
        return (self.pagina - 1) * self.por_pagina


def params_paginacion(
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=20, ge=1, le=100),
) -> ParamsPaginacion:
    return ParamsPaginacion(pagina=pagina, por_pagina=por_pagina)


class Pagina[T](BaseModel):
    items: list[T]
    total: int
    pagina: int
    por_pagina: int
