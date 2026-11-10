from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from httpx import AsyncClient, Response

from tests.conftest import PASSWORD


@pytest.fixture
def login(cliente: AsyncClient) -> Callable[..., Awaitable[Response]]:
    async def _login(email: str, password: str = PASSWORD) -> Response:
        return await cliente.post("/auth/login", json={"email": email, "password": password})

    return _login


@pytest.fixture
def refrescar(cliente: AsyncClient) -> Callable[[str], Awaitable[Response]]:
    async def _refrescar(token: str) -> Response:
        return await cliente.post("/auth/refresh", json={"refresh_token": token})

    return _refrescar


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


Json = dict[str, Any]
