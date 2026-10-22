"""join approval and permanent child code

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-22 12:06:21.196896
"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Как app.security.new_invite_code; миграция не импортирует код приложения
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    op.add_column('families', sa.Column('child_invite_code', sa.String(length=6), nullable=True))
    op.create_unique_constraint('uq_families_child_invite_code', 'families', ['child_invite_code'])
    # Все, кто уже в семьях, подтверждены
    op.add_column('members', sa.Column('status', sa.String(length=8), server_default='active', nullable=False))

    # Постоянный детский код для уже существующих семей
    conn = op.get_bind()
    taken = {code for (code,) in conn.execute(sa.text("SELECT invite_code FROM families"))}
    taken |= {code for (code,) in conn.execute(sa.text("SELECT code FROM child_invites"))}
    for (family_id,) in conn.execute(sa.text("SELECT id FROM families")).fetchall():
        code = None
        while code is None or code in taken:
            code = "".join(secrets.choice(_ALPHABET) for _ in range(6))
        taken.add(code)
        conn.execute(sa.text("UPDATE families SET child_invite_code = :c WHERE id = :id"), {"c": code, "id": family_id})


def downgrade() -> None:
    op.drop_column('members', 'status')
    op.drop_constraint('uq_families_child_invite_code', 'families', type_='unique')
    op.drop_column('families', 'child_invite_code')
