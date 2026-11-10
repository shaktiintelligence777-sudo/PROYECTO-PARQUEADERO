"""esquema inicial

Revision ID: 0001
Revises:
Create Date: 2026-11-10

Crea el esquema completo del MVP (ver docs/ROADMAP.md §2.4) y protege la tabla
`auditoria` contra UPDATE y DELETE con un trigger.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUDITORIA_INMUTABLE_FN = """
CREATE OR REPLACE FUNCTION impedir_modificacion_auditoria() RETURNS trigger AS $$
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


def upgrade() -> None:
    op.create_table(
        "clientes",
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("documento", sa.String(length=30), nullable=False),
        sa.Column("telefono", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
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
        sa.Column("eliminado_en", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clientes")),
    )
    op.create_index("ix_clientes_nombre", "clientes", ["nombre"], unique=False)
    op.create_index(
        "uq_clientes_documento_vigente",
        "clientes",
        ["documento"],
        unique=True,
        postgresql_where=sa.text("eliminado_en IS NULL"),
    )
    op.create_table(
        "intentos_login",
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("exitoso", sa.Boolean(), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intentos_login")),
    )
    op.create_index(
        "ix_intentos_login_email_creado", "intentos_login", ["email", "creado_en"], unique=False
    )
    op.create_index(
        "ix_intentos_login_ip_creado", "intentos_login", ["ip", "creado_en"], unique=False
    )
    op.create_table(
        "planes",
        sa.Column("nombre", sa.String(length=60), nullable=False),
        sa.Column("duracion_dias", sa.Integer(), nullable=False),
        sa.Column("precio", sa.BigInteger(), nullable=False),
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
        sa.CheckConstraint("duracion_dias > 0", name=op.f("ck_planes_duracion_positiva")),
        sa.CheckConstraint("precio >= 0", name=op.f("ck_planes_precio_no_negativo")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_planes")),
        sa.UniqueConstraint("nombre", name=op.f("uq_planes_nombre")),
    )
    op.create_table(
        "usuarios",
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column(
            "rol",
            sa.Enum(
                "admin",
                "operador",
                name="rol_usuario",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
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
        sa.Column("accion", sa.String(length=40), nullable=False),
        sa.Column("entidad", sa.String(length=40), nullable=False),
        sa.Column("entidad_id", sa.String(length=64), nullable=True),
        sa.Column("datos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            name=op.f("fk_auditoria_usuario_id_usuarios"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auditoria")),
    )
    op.create_index("ix_auditoria_creado_en", "auditoria", ["creado_en"], unique=False)
    op.create_index("ix_auditoria_entidad", "auditoria", ["entidad", "entidad_id"], unique=False)
    op.create_index("ix_auditoria_usuario_id", "auditoria", ["usuario_id"], unique=False)
    # La auditoría es de solo inserción.
    op.execute(AUDITORIA_INMUTABLE_FN)
    op.execute(AUDITORIA_INMUTABLE_TRIGGER)
    op.create_table(
        "membresias",
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=False),
        sa.Column(
            "estado",
            sa.Enum(
                "activa",
                "por_vencer",
                "vencida",
                "cancelada",
                name="estado_membresia",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="activa",
            nullable=False,
        ),
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
            "fecha_vencimiento >= fecha_inicio", name=op.f("ck_membresias_fechas_ordenadas")
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
    op.create_index(op.f("ix_membresias_cliente_id"), "membresias", ["cliente_id"], unique=False)
    op.create_index(op.f("ix_membresias_plan_id"), "membresias", ["plan_id"], unique=False)
    op.create_index("ix_membresias_vencimiento", "membresias", ["fecha_vencimiento"], unique=False)
    op.create_index(
        "uq_membresias_cliente_vigente",
        "membresias",
        ["cliente_id"],
        unique=True,
        postgresql_where=sa.text("estado <> 'cancelada'"),
    )
    op.create_table(
        "motos",
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("placa", sa.String(length=10), nullable=False),
        sa.Column("marca", sa.String(length=60), nullable=True),
        sa.Column("color", sa.String(length=40), nullable=True),
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
        sa.Column("eliminado_en", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("placa ~ '^[A-Z0-9]{4,10}$'", name=op.f("ck_motos_placa_normalizada")),
        sa.ForeignKeyConstraint(
            ["cliente_id"],
            ["clientes.id"],
            name=op.f("fk_motos_cliente_id_clientes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_motos")),
    )
    op.create_index(op.f("ix_motos_cliente_id"), "motos", ["cliente_id"], unique=False)
    op.create_index(
        "uq_motos_placa_vigente",
        "motos",
        ["placa"],
        unique=True,
        postgresql_where=sa.text("eliminado_en IS NULL"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("familia_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expira_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revocado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reemplazado_por", sa.Uuid(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["reemplazado_por"],
            ["refresh_tokens.id"],
            name=op.f("fk_refresh_tokens_reemplazado_por_refresh_tokens"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            name=op.f("fk_refresh_tokens_usuario_id_usuarios"),
            ondelete="CASCADE",
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
        sa.Column(
            "entrada_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("salida_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operador_entrada", sa.Uuid(), nullable=False),
        sa.Column("operador_salida", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint(
            "(salida_en IS NULL) = (operador_salida IS NULL)",
            name=op.f("ck_estancias_salida_con_operador"),
        ),
        sa.CheckConstraint(
            "salida_en IS NULL OR salida_en >= entrada_en",
            name=op.f("ck_estancias_salida_posterior"),
        ),
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
    op.create_index("ix_estancias_entrada_en", "estancias", ["entrada_en"], unique=False)
    op.create_index(
        "ix_estancias_moto_entrada", "estancias", ["moto_id", "entrada_en"], unique=False
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
            "tipo",
            sa.Enum(
                "recordatorio",
                "vencida",
                name="tipo_notificacion",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "canal",
            sa.Enum(
                "email",
                "whatsapp",
                name="canal_notificacion",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("programada_para", sa.Date(), nullable=False),
        sa.Column(
            "estado",
            sa.Enum(
                "pendiente",
                "enviada",
                "fallida",
                name="estado_notificacion",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="pendiente",
            nullable=False,
        ),
        sa.Column("intentos", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("enviada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_error", sa.String(length=500), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["membresia_id"],
            ["membresias.id"],
            name=op.f("fk_notificaciones_membresia_id_membresias"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notificaciones")),
        sa.UniqueConstraint(
            "membresia_id", "tipo", "canal", "programada_para", name="uq_notificaciones_aviso"
        ),
    )
    op.create_index(
        "ix_notificaciones_pendientes",
        "notificaciones",
        ["programada_para"],
        unique=False,
        postgresql_where=sa.text("estado = 'pendiente'"),
    )
    op.create_table(
        "pagos",
        sa.Column("membresia_id", sa.Uuid(), nullable=False),
        sa.Column("monto", sa.BigInteger(), nullable=False),
        sa.Column(
            "metodo",
            sa.Enum(
                "efectivo",
                "transferencia",
                "otro",
                name="metodo_pago",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("periodo_desde", sa.Date(), nullable=False),
        sa.Column("periodo_hasta", sa.Date(), nullable=False),
        sa.Column("nota", sa.String(length=500), nullable=True),
        sa.Column("registrado_por", sa.Uuid(), nullable=False),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint("monto > 0", name=op.f("ck_pagos_monto_positivo")),
        sa.CheckConstraint(
            "periodo_hasta >= periodo_desde", name=op.f("ck_pagos_periodo_ordenado")
        ),
        sa.ForeignKeyConstraint(
            ["membresia_id"],
            ["membresias.id"],
            name=op.f("fk_pagos_membresia_id_membresias"),
            ondelete="RESTRICT",
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


def downgrade() -> None:
    op.drop_index(op.f("ix_pagos_membresia_id"), table_name="pagos")
    op.drop_index(op.f("ix_pagos_creado_en"), table_name="pagos")
    op.drop_table("pagos")
    op.drop_index(
        "ix_notificaciones_pendientes",
        table_name="notificaciones",
        postgresql_where=sa.text("estado = 'pendiente'"),
    )
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
    op.drop_index(
        "uq_motos_placa_vigente",
        table_name="motos",
        postgresql_where=sa.text("eliminado_en IS NULL"),
    )
    op.drop_index(op.f("ix_motos_cliente_id"), table_name="motos")
    op.drop_table("motos")
    op.drop_index(
        "uq_membresias_cliente_vigente",
        table_name="membresias",
        postgresql_where=sa.text("estado <> 'cancelada'"),
    )
    op.drop_index("ix_membresias_vencimiento", table_name="membresias")
    op.drop_index(op.f("ix_membresias_plan_id"), table_name="membresias")
    op.drop_index(op.f("ix_membresias_cliente_id"), table_name="membresias")
    op.drop_table("membresias")
    op.execute("DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria")
    op.execute("DROP FUNCTION IF EXISTS impedir_modificacion_auditoria()")
    op.drop_index("ix_auditoria_usuario_id", table_name="auditoria")
    op.drop_index("ix_auditoria_entidad", table_name="auditoria")
    op.drop_index("ix_auditoria_creado_en", table_name="auditoria")
    op.drop_table("auditoria")
    op.drop_index("uq_usuarios_email_lower", table_name="usuarios")
    op.drop_table("usuarios")
    op.drop_table("planes")
    op.drop_index("ix_intentos_login_ip_creado", table_name="intentos_login")
    op.drop_index("ix_intentos_login_email_creado", table_name="intentos_login")
    op.drop_table("intentos_login")
    op.drop_index(
        "uq_clientes_documento_vigente",
        table_name="clientes",
        postgresql_where=sa.text("eliminado_en IS NULL"),
    )
    op.drop_index("ix_clientes_nombre", table_name="clientes")
    op.drop_table("clientes")
