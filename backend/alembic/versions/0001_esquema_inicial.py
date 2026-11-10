"""B-02: esquema inicial

Revision ID: 0001
Revises:
Create Date: 2026-11-10

Crea las 12 tablas de specs/B-02-esquema-bd.md, la extensión `unaccent` con su envoltorio
IMMUTABLE `f_unaccent` (para el índice de búsqueda de clientes), el trigger que hace la tabla
`auditoria` de solo inserción y la fila única de `configuracion` con las plantillas por defecto.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.modules.configuracion.models import PLANTILLAS_POR_DEFECTO

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

F_UNACCENT = """
CREATE FUNCTION f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
"""

AUDITORIA_INMUTABLE_FN = """
CREATE FUNCTION impedir_modificacion_auditoria() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla auditoria es de solo inserción';
END;
$$ LANGUAGE plpgsql;
"""

AUDITORIA_INMUTABLE_TRIGGER = """
CREATE TRIGGER trg_auditoria_inmutable
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION impedir_modificacion_auditoria();
"""

TIPOS_ENUM = (
    "rol_usuario",
    "metodo_pago",
    "tipo_notificacion",
    "canal_notificacion",
    "estado_notificacion",
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute(F_UNACCENT)

    op.create_table(
        "clientes",
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("documento", sa.Text(), nullable=False),
        sa.Column("telefono", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "documento ~ '^[A-Za-z0-9]{5,20}$'", name=op.f("ck_clientes_documento_formato")
        ),
        sa.CheckConstraint(
            "telefono ~ '^\\+?[0-9]{7,15}$'", name=op.f("ck_clientes_telefono_formato")
        ),
        sa.CheckConstraint("char_length(email) <= 254", name=op.f("ck_clientes_email_longitud")),
        sa.CheckConstraint(
            "char_length(nombre) BETWEEN 2 AND 120", name=op.f("ck_clientes_nombre_longitud")
        ),
        sa.CheckConstraint("char_length(notas) <= 500", name=op.f("ck_clientes_notas_longitud")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clientes")),
        sa.UniqueConstraint("documento", name=op.f("uq_clientes_documento")),
    )
    op.create_index(
        "ix_clientes_nombre_busqueda",
        "clientes",
        [sa.literal_column("lower(f_unaccent(nombre))")],
        unique=False,
    )
    op.create_table(
        "configuracion",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("nombre_parqueadero", sa.Text(), nullable=False),
        sa.Column("capacidad", sa.Integer(), nullable=True),
        sa.Column("dias_por_vencer", sa.Integer(), server_default=sa.text("3"), nullable=False),
        sa.Column(
            "dias_recordatorio",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{3,1,0}'"),
            nullable=False,
        ),
        sa.Column("plantilla_recordatorio_asunto", sa.Text(), nullable=False),
        sa.Column("plantilla_recordatorio_cuerpo", sa.Text(), nullable=False),
        sa.Column("plantilla_vencida_asunto", sa.Text(), nullable=False),
        sa.Column("plantilla_vencida_cuerpo", sa.Text(), nullable=False),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("capacidad > 0", name=op.f("ck_configuracion_capacidad_positiva")),
        sa.CheckConstraint(
            "dias_por_vencer BETWEEN 0 AND 30", name=op.f("ck_configuracion_dias_por_vencer_rango")
        ),
        sa.CheckConstraint("id = 1", name=op.f("ck_configuracion_fila_unica")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_configuracion")),
    )
    op.create_table(
        "intentos_login",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=False),
        sa.Column("exitoso", sa.Boolean(), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intentos_login")),
    )
    op.create_index(
        "ix_intentos_login_email_creado_en", "intentos_login", ["email", "creado_en"], unique=False
    )
    op.create_index(
        "ix_intentos_login_ip_creado_en", "intentos_login", ["ip", "creado_en"], unique=False
    )
    op.create_table(
        "planes",
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("duracion_dias", sa.Integer(), nullable=False),
        sa.Column("precio", sa.Integer(), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(nombre) BETWEEN 2 AND 60", name=op.f("ck_planes_nombre_longitud")
        ),
        sa.CheckConstraint(
            "duracion_dias BETWEEN 1 AND 366", name=op.f("ck_planes_duracion_rango")
        ),
        sa.CheckConstraint("precio > 0", name=op.f("ck_planes_precio_positivo")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_planes")),
    )
    op.create_index(
        "uq_planes_nombre_activo",
        "planes",
        [sa.literal_column("lower(nombre)")],
        unique=True,
        postgresql_where=sa.text("activo"),
    )
    op.create_table(
        "usuarios",
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("rol", sa.Enum("admin", "operador", name="rol_usuario"), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usuarios")),
    )
    op.create_index(
        "uq_usuarios_email_lower", "usuarios", [sa.literal_column("lower(email)")], unique=True
    )
    op.create_table(
        "auditoria",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("accion", sa.Text(), nullable=False),
        sa.Column("entidad", sa.Text(), nullable=False),
        sa.Column("entidad_id", sa.Uuid(), nullable=True),
        sa.Column(
            "datos",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            name=op.f("fk_auditoria_usuario_id_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auditoria")),
    )
    op.create_index(op.f("ix_auditoria_creado_en"), "auditoria", ["creado_en"], unique=False)
    op.create_index("ix_auditoria_entidad", "auditoria", ["entidad", "entidad_id"], unique=False)
    op.execute(AUDITORIA_INMUTABLE_FN)
    op.execute(AUDITORIA_INMUTABLE_TRIGGER)
    op.create_table(
        "membresias",
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=False),
        sa.Column("cancelada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelada_por", sa.Uuid(), nullable=True),
        sa.Column("motivo_cancelacion", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(cancelada_en IS NULL AND cancelada_por IS NULL AND motivo_cancelacion IS NULL) OR (cancelada_en IS NOT NULL AND cancelada_por IS NOT NULL AND motivo_cancelacion IS NOT NULL)",
            name=op.f("ck_membresias_cancelacion_completa"),
        ),
        sa.CheckConstraint(
            "fecha_vencimiento >= fecha_inicio", name=op.f("ck_membresias_fechas_ordenadas")
        ),
        sa.ForeignKeyConstraint(
            ["cancelada_por"],
            ["usuarios.id"],
            name=op.f("fk_membresias_cancelada_por_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cliente_id"],
            ["clientes.id"],
            name=op.f("fk_membresias_cliente_id_clientes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["planes.id"],
            name=op.f("fk_membresias_plan_id_planes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_membresias")),
    )
    op.create_index(
        op.f("ix_membresias_fecha_vencimiento"), "membresias", ["fecha_vencimiento"], unique=False
    )
    op.create_index(
        "uq_membresias_cliente_no_cancelada",
        "membresias",
        ["cliente_id"],
        unique=True,
        postgresql_where=sa.text("cancelada_en IS NULL"),
    )
    op.create_table(
        "motos",
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("placa", sa.Text(), nullable=False),
        sa.Column("marca", sa.Text(), nullable=True),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("placa ~ '^[A-Z0-9]{4,7}$'", name=op.f("ck_motos_placa_formato")),
        sa.CheckConstraint("char_length(color) <= 30", name=op.f("ck_motos_color_longitud")),
        sa.CheckConstraint("char_length(marca) <= 40", name=op.f("ck_motos_marca_longitud")),
        sa.ForeignKeyConstraint(
            ["cliente_id"],
            ["clientes.id"],
            name=op.f("fk_motos_cliente_id_clientes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_motos")),
        sa.UniqueConstraint("placa", name=op.f("uq_motos_placa")),
    )
    op.create_index(op.f("ix_motos_cliente_id"), "motos", ["cliente_id"], unique=False)
    op.create_table(
        "refresh_tokens",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("familia_id", sa.Uuid(), nullable=False),
        sa.Column("expira_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            name=op.f("fk_refresh_tokens_usuario_id_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_refresh_tokens_familia_id"), "refresh_tokens", ["familia_id"], unique=False
    )
    op.create_index(
        op.f("ix_refresh_tokens_usuario_id"), "refresh_tokens", ["usuario_id"], unique=False
    )
    op.create_table(
        "estancias",
        sa.Column("moto_id", sa.Uuid(), nullable=False),
        sa.Column("entrada_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("salida_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operador_entrada", sa.Uuid(), nullable=False),
        sa.Column("operador_salida", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint(
            "(salida_en IS NULL) = (operador_salida IS NULL)",
            name=op.f("ck_estancias_salida_con_operador"),
        ),
        sa.CheckConstraint("salida_en >= entrada_en", name=op.f("ck_estancias_salida_posterior")),
        sa.ForeignKeyConstraint(
            ["moto_id"], ["motos.id"], name=op.f("fk_estancias_moto_id_motos"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["operador_entrada"],
            ["usuarios.id"],
            name=op.f("fk_estancias_operador_entrada_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["operador_salida"],
            ["usuarios.id"],
            name=op.f("fk_estancias_operador_salida_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_estancias")),
    )
    op.create_index(
        "ix_estancias_entrada_en", "estancias", [sa.literal_column("entrada_en DESC")], unique=False
    )
    op.create_index(
        "ix_estancias_moto_entrada",
        "estancias",
        ["moto_id", sa.literal_column("entrada_en DESC")],
        unique=False,
    )
    op.create_index(
        "uq_estancias_moto_abierta",
        "estancias",
        ["moto_id"],
        unique=True,
        postgresql_where=sa.text("salida_en IS NULL"),
    )
    op.create_table(
        "notificaciones",
        sa.Column("membresia_id", sa.Uuid(), nullable=False),
        sa.Column(
            "tipo", sa.Enum("recordatorio", "vencida", name="tipo_notificacion"), nullable=False
        ),
        sa.Column("canal", sa.Enum("email", "whatsapp", name="canal_notificacion"), nullable=False),
        sa.Column("programada_para", sa.Date(), nullable=False),
        sa.Column(
            "estado",
            sa.Enum("pendiente", "enviada", "fallida", "cancelada", name="estado_notificacion"),
            server_default=sa.text("'pendiente'"),
            nullable=False,
        ),
        sa.Column("enviada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("intentos", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint(
            "intentos BETWEEN 0 AND 3", name=op.f("ck_notificaciones_intentos_rango")
        ),
        sa.ForeignKeyConstraint(
            ["membresia_id"],
            ["membresias.id"],
            name=op.f("fk_notificaciones_membresia_id_membresias"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notificaciones")),
        sa.UniqueConstraint(
            "membresia_id", "tipo", "programada_para", "canal", name="uq_notificaciones_aviso"
        ),
    )
    op.create_index(
        op.f("ix_notificaciones_programada_para"),
        "notificaciones",
        ["programada_para"],
        unique=False,
    )
    op.create_table(
        "pagos",
        sa.Column("membresia_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("monto", sa.Integer(), nullable=False),
        sa.Column(
            "metodo",
            sa.Enum("efectivo", "transferencia", "otro", name="metodo_pago"),
            nullable=False,
        ),
        sa.Column("periodos", sa.Integer(), nullable=False),
        sa.Column("periodo_desde", sa.Date(), nullable=False),
        sa.Column("periodo_hasta", sa.Date(), nullable=False),
        sa.Column("vencimiento_anterior", sa.Date(), nullable=True),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("registrado_por", sa.Uuid(), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("anulado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anulado_por", sa.Uuid(), nullable=True),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint(
            "(anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL) OR (anulado_en IS NOT NULL AND anulado_por IS NOT NULL AND motivo_anulacion IS NOT NULL)",
            name=op.f("ck_pagos_anulacion_completa"),
        ),
        sa.CheckConstraint("char_length(nota) <= 300", name=op.f("ck_pagos_nota_longitud")),
        sa.CheckConstraint("monto > 0", name=op.f("ck_pagos_monto_positivo")),
        sa.CheckConstraint(
            "periodo_hasta >= periodo_desde", name=op.f("ck_pagos_periodo_ordenado")
        ),
        sa.CheckConstraint("periodos BETWEEN 1 AND 12", name=op.f("ck_pagos_periodos_rango")),
        sa.ForeignKeyConstraint(
            ["anulado_por"],
            ["usuarios.id"],
            name=op.f("fk_pagos_anulado_por_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["membresia_id"],
            ["membresias.id"],
            name=op.f("fk_pagos_membresia_id_membresias"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["planes.id"], name=op.f("fk_pagos_plan_id_planes"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["registrado_por"],
            ["usuarios.id"],
            name=op.f("fk_pagos_registrado_por_usuarios"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pagos")),
    )
    op.create_index(op.f("ix_pagos_creado_en"), "pagos", ["creado_en"], unique=False)
    op.create_index(op.f("ix_pagos_membresia_id"), "pagos", ["membresia_id"], unique=False)

    configuracion = sa.table(
        "configuracion",
        sa.column("id", sa.SmallInteger),
        sa.column("nombre_parqueadero", sa.Text),
        *(sa.column(c, sa.Text) for c in PLANTILLAS_POR_DEFECTO),
    )
    op.bulk_insert(
        configuracion, [{"id": 1, "nombre_parqueadero": "Parqueadero", **PLANTILLAS_POR_DEFECTO}]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_pagos_membresia_id"), table_name="pagos")
    op.drop_index(op.f("ix_pagos_creado_en"), table_name="pagos")
    op.drop_table("pagos")
    op.drop_index(op.f("ix_notificaciones_programada_para"), table_name="notificaciones")
    op.drop_table("notificaciones")
    op.drop_index(
        "uq_estancias_moto_abierta",
        table_name="estancias",
        postgresql_where=sa.text("salida_en IS NULL"),
    )
    op.drop_index("ix_estancias_moto_entrada", table_name="estancias")
    op.drop_index("ix_estancias_entrada_en", table_name="estancias")
    op.drop_table("estancias")
    op.drop_index(op.f("ix_refresh_tokens_usuario_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_familia_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_motos_cliente_id"), table_name="motos")
    op.drop_table("motos")
    op.drop_index(
        "uq_membresias_cliente_no_cancelada",
        table_name="membresias",
        postgresql_where=sa.text("cancelada_en IS NULL"),
    )
    op.drop_index(op.f("ix_membresias_fecha_vencimiento"), table_name="membresias")
    op.drop_table("membresias")
    op.execute("DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria")
    op.drop_index("ix_auditoria_entidad", table_name="auditoria")
    op.drop_index(op.f("ix_auditoria_creado_en"), table_name="auditoria")
    op.drop_table("auditoria")
    op.drop_index("uq_usuarios_email_lower", table_name="usuarios")
    op.drop_table("usuarios")
    op.drop_index(
        "uq_planes_nombre_activo", table_name="planes", postgresql_where=sa.text("activo")
    )
    op.drop_table("planes")
    op.drop_index("ix_intentos_login_ip_creado_en", table_name="intentos_login")
    op.drop_index("ix_intentos_login_email_creado_en", table_name="intentos_login")
    op.drop_table("intentos_login")
    op.drop_table("configuracion")
    op.drop_index("ix_clientes_nombre_busqueda", table_name="clientes")
    op.drop_table("clientes")
    op.execute("DROP FUNCTION IF EXISTS impedir_modificacion_auditoria()")
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
    for tipo in TIPOS_ENUM:
        op.execute(f"DROP TYPE IF EXISTS {tipo}")
