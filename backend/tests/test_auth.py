import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Depends
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.deps import requiere_rol, requiere_token_servicio
from app.core.security import AUDIENCIA_ACCESO, crear_access_token, hash_token
from app.modules.auditoria.models import Auditoria
from app.modules.auth.models import IntentoLogin, RefreshToken
from app.modules.usuarios.models import Rol
from tests.conftest import PASSWORD


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Login ----------------------------------------------------------------------------------


def test_login_correcto_entrega_tokens_y_usuario(crear_usuario, login):
    u = crear_usuario(email="ana@parqueadero.app", rol=Rol.ADMIN)
    r = login("ana@parqueadero.app")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["expires_in"] == 15 * 60
    assert cuerpo["refresh_token"]
    assert cuerpo["usuario"] == {
        "id": str(u.id),
        "email": "ana@parqueadero.app",
        "nombre": "Usuario de prueba",
        "rol": "admin",
        "activo": True,
    }
    assert "password_hash" not in r.text
    assert r.headers["Cache-Control"] == "no-store"


def test_login_ignora_mayusculas_y_espacios_en_email(crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app")
    assert login("  ANA@Parqueadero.App ").status_code == 200


def test_password_se_guarda_con_argon2id(crear_usuario):
    u = crear_usuario()
    assert u.password_hash.startswith("$argon2id$")
    assert PASSWORD not in u.password_hash


@pytest.mark.parametrize("caso", ["password_mala", "email_inexistente", "inactivo"])
def test_login_fallido_responde_401_generico(caso, crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app", activo=caso != "inactivo")
    email = "otro@parqueadero.app" if caso == "email_inexistente" else "ana@parqueadero.app"
    password = "incorrecta" if caso == "password_mala" else PASSWORD
    r = login(email, password)
    assert r.status_code == 401
    assert r.json() == {"detail": "Email o contraseña incorrectos"}


def test_login_registra_auditoria(db, crear_usuario, login):
    u = crear_usuario(email="ana@parqueadero.app")
    login("ana@parqueadero.app", "mala")
    login("ana@parqueadero.app")
    acciones = db.scalars(
        select(Auditoria.accion).where(Auditoria.usuario_id == u.id).order_by(Auditoria.id)
    ).all()
    assert acciones == ["login_fallido", "login"]


# --- Límite de intentos ---------------------------------------------------------------------


def test_bloqueo_tras_cinco_fallos_por_email(crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app")
    for _ in range(5):
        assert login("ana@parqueadero.app", "mala").status_code == 401
    r = login("ana@parqueadero.app")  # incluso con la contraseña correcta
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_fallos_fuera_de_la_ventana_no_cuentan(db, crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app")
    viejo = datetime.now(UTC) - timedelta(seconds=get_settings().login_ventana_segundos + 5)
    db.add_all(
        [
            IntentoLogin(email="ana@parqueadero.app", ip="1.1.1.1", exitoso=False, creado_en=viejo)
            for _ in range(10)
        ]
    )
    db.flush()
    assert login("ana@parqueadero.app").status_code == 200


def test_bloqueo_por_ip(db, crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app")
    db.add_all(
        [
            IntentoLogin(email=f"x{i}@parqueadero.app", ip="testclient", exitoso=False)
            for i in range(get_settings().login_max_intentos_ip)
        ]
    )
    db.flush()
    assert login("ana@parqueadero.app").status_code == 429


# --- Access token ---------------------------------------------------------------------------


def test_me_con_token_valido(crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    token = login("ana@parqueadero.app").json()["access_token"]
    r = client.get("/api/v1/auth/me", headers=_bearer(token))
    assert r.status_code == 200
    assert r.json()["email"] == "ana@parqueadero.app"


def test_me_sin_token(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.headers["WWW-Authenticate"] == "Bearer"


def test_access_token_expirado(crear_usuario, client):
    u = crear_usuario()
    hace_una_hora = datetime.now(UTC) - timedelta(hours=1)
    token = crear_access_token(u.id, u.rol.value, ahora=hace_una_hora).token
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401


def test_access_token_con_otra_firma(crear_usuario, client):
    u = crear_usuario()
    ahora = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(u.id),
            "typ": "access",
            "aud": AUDIENCIA_ACCESO,
            "iss": get_settings().jwt_emisor,
            "iat": ahora,
            "exp": ahora + timedelta(minutes=5),
        },
        "otro-secreto-cualquiera-de-32-caracteres!!",
        algorithm="HS256",
    )
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401


def test_access_token_alg_none_rechazado(crear_usuario, client):
    u = crear_usuario()
    token = jwt.encode({"sub": str(u.id), "typ": "access"}, key=None, algorithm="none")
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401


def test_refresh_token_no_sirve_como_access(crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    refresh = login("ana@parqueadero.app").json()["refresh_token"]
    assert client.get("/api/v1/auth/me", headers=_bearer(refresh)).status_code == 401


def test_usuario_desactivado_pierde_acceso(db, crear_usuario, login, client):
    u = crear_usuario(email="ana@parqueadero.app")
    token = login("ana@parqueadero.app").json()["access_token"]
    u.activo = False
    db.flush()
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401


# --- Refresh rotativo -----------------------------------------------------------------------


def _refresh(client, token):
    return client.post("/api/v1/auth/refresh", json={"refresh_token": token})


def test_refresh_rota_el_token(crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    t1 = login("ana@parqueadero.app").json()["refresh_token"]
    r = _refresh(client, t1)
    assert r.status_code == 200
    t2 = r.json()["refresh_token"]
    assert t2 != t1
    assert (
        client.get("/api/v1/auth/me", headers=_bearer(r.json()["access_token"])).status_code == 200
    )
    assert _refresh(client, t2).status_code == 200


def test_reutilizar_refresh_revoca_toda_la_sesion(db, crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    t1 = login("ana@parqueadero.app").json()["refresh_token"]
    t2 = _refresh(client, t1).json()["refresh_token"]

    assert _refresh(client, t1).status_code == 401  # reutilización
    assert _refresh(client, t2).status_code == 401  # la familia completa quedó revocada
    # Ambos intentos usan tokens ya revocados y quedan auditados.
    assert db.scalar(select(func.count()).where(Auditoria.accion == "refresh_reutilizado")) == 2


def test_refresh_no_afecta_otras_sesiones(crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    celular = login("ana@parqueadero.app").json()["refresh_token"]
    pc = login("ana@parqueadero.app").json()["refresh_token"]
    _refresh(client, celular)
    _refresh(client, celular)  # reutilización en el celular
    assert _refresh(client, pc).status_code == 200


def test_refresh_expirado(db, crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    t = login("ana@parqueadero.app").json()["refresh_token"]
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(t))
        .values(expira_en=datetime.now(UTC) - timedelta(seconds=1))
    )
    assert _refresh(client, t).status_code == 401


def test_refresh_desconocido(client):
    assert _refresh(client, "no-existe").status_code == 401


def test_solo_se_guarda_el_hash_del_refresh(db, crear_usuario, login):
    crear_usuario(email="ana@parqueadero.app")
    t = login("ana@parqueadero.app").json()["refresh_token"]
    hashes = db.scalars(select(RefreshToken.token_hash)).all()
    assert hash_token(t) in hashes
    assert t not in hashes


# --- Logout ---------------------------------------------------------------------------------


def test_logout_revoca_la_sesion(crear_usuario, login, client):
    crear_usuario(email="ana@parqueadero.app")
    t = login("ana@parqueadero.app").json()["refresh_token"]
    assert client.post("/api/v1/auth/logout", json={"refresh_token": t}).status_code == 204
    assert _refresh(client, t).status_code == 401


def test_logout_es_idempotente(client):
    assert client.post("/api/v1/auth/logout", json={"refresh_token": "x"}).status_code == 204


# --- Roles y token de servicio --------------------------------------------------------------


@pytest.fixture
def rutas_protegidas(app):
    @app.get("/prueba/solo-admin")
    def solo_admin(_=Depends(requiere_rol(Rol.ADMIN))):
        return {"ok": True}

    @app.post("/prueba/interno")
    def interno(_=Depends(requiere_token_servicio)):
        return {"ok": True}


@pytest.mark.parametrize(("rol", "esperado"), [(Rol.ADMIN, 200), (Rol.OPERADOR, 403)])
def test_requiere_rol(rol, esperado, rutas_protegidas, crear_usuario, client):
    u = crear_usuario(rol=rol)
    token = crear_access_token(u.id, u.rol.value).token
    assert client.get("/prueba/solo-admin", headers=_bearer(token)).status_code == esperado


def test_rol_se_lee_de_la_bd_y_no_del_token(db, rutas_protegidas, crear_usuario, client):
    u = crear_usuario(rol=Rol.OPERADOR)
    token = crear_access_token(u.id, "admin").token  # el token dice admin, la BD dice operador
    assert client.get("/prueba/solo-admin", headers=_bearer(token)).status_code == 403


def test_token_de_servicio(rutas_protegidas, crear_usuario, client):
    u = crear_usuario(rol=Rol.ADMIN)
    jwt_usuario = crear_access_token(u.id, u.rol.value).token
    assert client.post("/prueba/interno", headers=_bearer(jwt_usuario)).status_code == 401
    assert client.post("/prueba/interno").status_code == 401
    token = get_settings().internal_job_token
    assert client.post("/prueba/interno", headers=_bearer(token)).status_code == 200


def test_sub_invalido_en_token(client):
    token = crear_access_token(uuid.uuid4(), "admin").token  # usuario inexistente
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 401
