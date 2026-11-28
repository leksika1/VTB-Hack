"""Common plan v2: equal members, login IDs and advanced payments.

Revision ID: 0012
Revises: 0011
"""
import hashlib
import secrets

from alembic import op
import sqlalchemy as sa


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_LOGIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _login_id(taken: set[str]) -> str:
    while True:
        raw = "".join(secrets.choice(_LOGIN_ALPHABET) for _ in range(10))
        value = raw[:5] + "-" + raw[5:]
        if value not in taken:
            taken.add(value)
            return value


def upgrade() -> None:
    # Владелец выбирается до перевода старых ролей в единую роль member.
    op.add_column("families", sa.Column("owner_id", sa.String(36), nullable=True))
    op.create_index("ix_families_owner_id", "families", ["owner_id"])
    op.execute(sa.text("""
        UPDATE families f SET owner_id = COALESCE(
          (SELECT m.id FROM members m
             WHERE m.family_id=f.id AND m.left_at IS NULL AND m.status='active' AND m.role='parent'
             ORDER BY m.joined_at, m.id LIMIT 1),
          (SELECT m.id FROM members m
             WHERE m.family_id=f.id AND m.left_at IS NULL AND m.status='active'
             ORDER BY m.joined_at, m.id LIMIT 1)
        )
    """))
    op.create_foreign_key(
        "fk_families_owner_id_members", "families", "members", ["owner_id"], ["id"],
        ondelete="SET NULL",
    )

    op.add_column("members", sa.Column("login_id", sa.String(11), nullable=True))
    op.add_column("members", sa.Column("login_id_hash", sa.String(64), nullable=True))
    op.add_column("members", sa.Column(
        "debt_reminder_threshold_kop", sa.BigInteger(), server_default=sa.text("100000"), nullable=False
    ))
    op.add_column("members", sa.Column("default_split", sa.String(8), server_default="ask", nullable=False))
    op.add_column("members", sa.Column(
        "calendar_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
    ))
    conn = op.get_bind()
    taken: set[str] = set()
    for member_id, in conn.execute(sa.text("SELECT id FROM members")).fetchall():
        value = _login_id(taken)
        conn.execute(sa.text(
            "UPDATE members SET login_id=:login_id, login_id_hash=:digest WHERE id=:member_id"
        ), {"login_id": value, "digest": hashlib.sha256(value.encode()).hexdigest(), "member_id": member_id})
    op.create_index("ix_members_login_id_hash", "members", ["login_id_hash"], unique=True)
    op.execute("UPDATE members SET role='member'")
    op.alter_column("members", "role", server_default="member", existing_type=sa.String(8), nullable=False)
    op.execute("UPDATE invite_links SET role='member' WHERE role <> 'member'")
    op.alter_column(
        "invite_links", "role", server_default="member", existing_type=sa.String(8), nullable=False
    )

    # Удалённый детский функционал и его данные.
    op.drop_constraint("fk_expenses_request_id", "expenses", type_="foreignkey")
    op.drop_constraint("uq_expenses_request_id", "expenses", type_="unique")
    op.drop_column("expenses", "request_id")
    op.drop_index("ix_purchase_requests_family_status", table_name="purchase_requests")
    op.drop_index("ix_purchase_requests_author_id", table_name="purchase_requests")
    op.drop_table("purchase_requests")
    op.drop_index("ix_allowances_family_id", table_name="allowances")
    op.drop_table("allowances")
    op.drop_index("ix_child_invites_family_id", table_name="child_invites")
    op.drop_table("child_invites")
    op.drop_constraint("uq_families_child_invite_code", "families", type_="unique")
    op.drop_column("families", "child_invite_code")

    # Покупки: новый словарь source/split, старые account_mode/split_percentages остаются совместимыми.
    op.add_column("expenses", sa.Column("source", sa.String(12), server_default="shared", nullable=False))
    op.add_column("expenses", sa.Column("split_mode", sa.String(8), server_default="none", nullable=False))
    op.add_column("expenses", sa.Column("split_shares", sa.JSON(), nullable=True))
    op.execute("UPDATE expenses SET source='personal' WHERE account_mode IN ('personal_split','outside')")
    op.execute("UPDATE expenses SET source='shared' WHERE account_mode IS NULL OR account_mode IN ('shared_split','shared_common')")
    op.execute("UPDATE expenses SET split_mode='equal' WHERE account_mode IN ('shared_split','personal_split')")
    op.execute(sa.text("""
        UPDATE expenses e SET split_mode='shares', split_shares=(
          SELECT jsonb_object_agg(item.key, (item.value::text)::integer * 100)
          FROM jsonb_each(CASE
            WHEN jsonb_typeof(e.split_percentages::jsonb) = 'object'
            THEN e.split_percentages::jsonb ELSE '{}'::jsonb
          END) AS item
        )::json
        WHERE jsonb_typeof(e.split_percentages::jsonb) = 'object'
          AND e.split_percentages::jsonb <> '{}'::jsonb
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_each(CASE
              WHEN jsonb_typeof(e.split_percentages::jsonb) = 'object'
              THEN e.split_percentages::jsonb ELSE '{}'::jsonb
            END) AS invalid
            WHERE jsonb_typeof(invalid.value) <> 'number'
               OR invalid.value::text !~ '^-?[0-9]+$'
          )
    """))

    # Платежи и произвольные серии.
    op.drop_constraint("uq_payments_series_month", "payments", type_="unique")
    op.add_column("payments", sa.Column("series_sequence", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("recurrence_rule", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("source", sa.String(12), server_default="shared", nullable=False))
    op.add_column("payments", sa.Column("split_mode", sa.String(8), server_default="none", nullable=False))
    op.add_column("payments", sa.Column("split_members", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("split_shares", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("amount_mode", sa.String(8), server_default="fixed", nullable=False))
    op.add_column("payments", sa.Column("payment_method", sa.String(8), server_default="manual", nullable=False))
    op.add_column("payments", sa.Column("autopay_type", sa.String(16), nullable=True))
    op.add_column("payments", sa.Column("provider_category", sa.String(20), nullable=True))
    op.add_column("payments", sa.Column("provider_name", sa.String(120), nullable=True))
    op.add_column("payments", sa.Column("provider_identifier", sa.String(120), nullable=True))
    op.add_column("payments", sa.Column("limit_amount_kop", sa.BigInteger(), nullable=True))
    op.add_column("payments", sa.Column("payment_details", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("invoice_issued_at", sa.BigInteger(), nullable=True))
    op.execute("UPDATE payments SET split_mode='equal' WHERE account_mode='shared_split'")
    # json_build_object вместо литерала: «:1» в тексте SQLAlchemy принял бы за параметр.
    op.execute(sa.text("""UPDATE payments SET recurrence_rule=
        json_build_object('frequency', 'monthly', 'interval', 1, 'endMode', 'never') WHERE recurring"""))
    # Старая уникальность по series_month допускала дубли даты при NULL/повреждённом
    # значении месяца. Сохраняем такие записи, но отсоединяем лишние от серии.
    op.execute(sa.text("""
        WITH ranked AS (
          SELECT id, row_number() OVER (
            PARTITION BY series_id, due_date ORDER BY created_at, id
          ) AS n
          FROM payments WHERE series_id IS NOT NULL
        )
        UPDATE payments p SET recurring=false, series_id=NULL, series_month=NULL,
          series_sequence=NULL, recurrence_rule=NULL
        FROM ranked WHERE p.id=ranked.id AND ranked.n > 1
    """))
    op.execute(sa.text("""
        WITH numbered AS (
          SELECT id, row_number() OVER (PARTITION BY series_id ORDER BY due_date, created_at, id) AS n
          FROM payments WHERE series_id IS NOT NULL
        ) UPDATE payments p SET series_sequence=numbered.n FROM numbered WHERE p.id=numbered.id
    """))
    op.create_unique_constraint("uq_payments_series_due", "payments", ["series_id", "due_date"])


def downgrade() -> None:
    # Старая схема умеет продолжать только ежемесячные серии с шагом 1.
    # Остальные вхождения сохраняем как разовые платежи, иначе старый сервис начнёт
    # ошибочно достраивать недельные, квартальные и годовые серии каждый месяц.
    op.execute(sa.text("""
        UPDATE payments SET recurring=false, series_id=NULL, series_month=NULL
        WHERE series_id IS NOT NULL AND (
          jsonb_typeof(recurrence_rule::jsonb) IS DISTINCT FROM 'object'
          OR recurrence_rule::jsonb ->> 'frequency' IS DISTINCT FROM 'monthly'
          OR recurrence_rule::jsonb ->> 'interval' IS DISTINCT FROM '1'
        )
    """))
    # Защита уникальности старой схемы, если после 0012 в одном месяце успело
    # появиться несколько вхождений одной серии: лишние остаются разовыми.
    op.execute(sa.text("""
        WITH ranked AS (
          SELECT id, row_number() OVER (
            PARTITION BY series_id, series_month ORDER BY due_date, created_at, id
          ) AS n
          FROM payments WHERE series_id IS NOT NULL AND series_month IS NOT NULL
        )
        UPDATE payments p SET recurring=false, series_id=NULL, series_month=NULL
        FROM ranked WHERE p.id=ranked.id AND ranked.n > 1
    """))
    op.drop_constraint("uq_payments_series_due", "payments", type_="unique")
    for column in (
        "invoice_issued_at", "payment_details", "limit_amount_kop", "provider_identifier", "provider_name",
        "provider_category", "autopay_type", "payment_method", "amount_mode", "split_shares", "split_members",
        "split_mode", "source", "recurrence_rule", "series_sequence",
    ):
        op.drop_column("payments", column)
    op.create_unique_constraint("uq_payments_series_month", "payments", ["series_id", "series_month"])
    for column in ("split_shares", "split_mode", "source"):
        op.drop_column("expenses", column)

    op.add_column("families", sa.Column("child_invite_code", sa.String(6), nullable=True))
    op.create_unique_constraint("uq_families_child_invite_code", "families", ["child_invite_code"])
    op.create_table(
        "allowances",
        sa.Column("member_id", sa.String(36), sa.ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("family_id", sa.String(36), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_kop", sa.BigInteger(), nullable=False), sa.Column("period", sa.String(8), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
    )
    op.create_index("ix_allowances_family_id", "allowances", ["family_id"])
    op.create_table(
        "child_invites",
        sa.Column("code", sa.String(6), primary_key=True),
        sa.Column("family_id", sa.String(36), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("used_at", sa.BigInteger()),
        sa.Column("used_by", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
    )
    op.create_index("ix_child_invites_family_id", "child_invites", ["family_id"])
    op.create_table(
        "purchase_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("family_id", sa.String(36), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("amount_kop", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("comment", sa.String(300)),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("decided_by", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("decided_at", sa.BigInteger()),
        sa.Column("decision_comment", sa.String(300)),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_purchase_requests_author_id", "purchase_requests", ["author_id"])
    op.create_index("ix_purchase_requests_family_status", "purchase_requests", ["family_id", "status"])
    op.add_column("expenses", sa.Column("request_id", sa.String(36), nullable=True))
    op.create_unique_constraint("uq_expenses_request_id", "expenses", ["request_id"])
    op.create_foreign_key("fk_expenses_request_id", "expenses", "purchase_requests", ["request_id"], ["id"],
                          ondelete="SET NULL")

    op.drop_index("ix_members_login_id_hash", table_name="members")
    for column in ("calendar_enabled", "default_split", "debt_reminder_threshold_kop", "login_id_hash", "login_id"):
        op.drop_column("members", column)
    op.alter_column("members", "role", server_default="parent", existing_type=sa.String(8), nullable=False)
    op.execute("UPDATE members SET role='parent'")
    op.execute("UPDATE invite_links SET role='parent' WHERE role='member'")
    op.alter_column(
        "invite_links", "role", server_default=None, existing_type=sa.String(8), nullable=False
    )
    op.drop_constraint("fk_families_owner_id_members", "families", type_="foreignkey")
    op.drop_index("ix_families_owner_id", table_name="families")
    op.drop_column("families", "owner_id")
