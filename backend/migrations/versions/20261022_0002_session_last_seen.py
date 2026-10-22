"""session last_seen_at for inactivity expiry

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("member_sessions", schema=None) as batch_op:
        # Существующим сессиям активность = момент создания
        batch_op.add_column(sa.Column("last_seen_at", sa.BigInteger(), nullable=True))
    op.execute("UPDATE member_sessions SET last_seen_at = created_at")
    with op.batch_alter_table("member_sessions", schema=None) as batch_op:
        batch_op.alter_column("last_seen_at", existing_type=sa.BigInteger(), nullable=False)
        batch_op.create_index(batch_op.f("ix_member_sessions_last_seen_at"), ["last_seen_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("member_sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_member_sessions_last_seen_at"))
        batch_op.drop_column("last_seen_at")
