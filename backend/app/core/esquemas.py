"""Piezas comunes de los esquemas Pydantic: entradas estrictas, PATCH y normalizadores."""

import re
from typing import Annotated, Any, ClassVar

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    model_validator,
)

from app.core.placas import normalizar_placa


class Entrada(BaseModel):
    """Toda entrada rechaza campos desconocidos (`additionalProperties: false`)."""

    model_config = ConfigDict(extra="forbid")


class Parche(Entrada):
    """Cuerpo de PATCH: al menos un campo (`minProperties: 1`) y sin `null` en los campos que el
    contrato no declara anulables (`NO_ANULABLES`)."""

    NO_ANULABLES: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _validar_parche(cls, datos: Any) -> Any:
        if isinstance(datos, dict):
            if not datos:
                raise ValueError("Envía al menos un campo para modificar.")
            for campo in cls.NO_ANULABLES:
                if campo in datos and datos[campo] is None:
                    raise ValueError(f"El campo {campo} no puede ser nulo.")
        return datos

    def cambios(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in self.model_fields_set}


def _vacio_a_none(v: object) -> object:
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _recortar(v: object) -> object:
    return v.strip() if isinstance(v, str) else v


def _sin_espacios(v: object) -> object:
    return re.sub(r"\s", "", v) if isinstance(v, str) else v


def _documento(v: object) -> object:
    return re.sub(r"[\s.]", "", v).upper() if isinstance(v, str) else v


def _email(v: object) -> object:
    v = _vacio_a_none(v)
    return v.lower() if isinstance(v, str) else v


def _placa(v: str) -> str:
    return normalizar_placa(v)


Texto = Annotated[str, BeforeValidator(_recortar)]
TextoOpcional = Annotated[str | None, BeforeValidator(_vacio_a_none)]
Documento = Annotated[str, BeforeValidator(_documento), Field(pattern=r"^[A-Z0-9]{5,20}$")]
Telefono = Annotated[str, BeforeValidator(_sin_espacios), Field(pattern=r"^\+?[0-9]{7,15}$")]
PlacaEntrada = Annotated[str, Field(min_length=4, max_length=10), AfterValidator(_placa)]
Dinero = Annotated[int, Field(ge=1, le=100_000_000, strict=True)]
EmailOpcional = Annotated[EmailStr | None, BeforeValidator(_email), Field(max_length=254)]
