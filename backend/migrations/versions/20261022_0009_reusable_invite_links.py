"""reusable invite links

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-22 12:22:52.152286
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('invite_links',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('family_id', sa.String(length=36), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('role', sa.String(length=8), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.BigInteger(), nullable=False),
    sa.Column('expires_at', sa.BigInteger(), nullable=False),
    sa.Column('uses', sa.Integer(), server_default='0', nullable=False),
    sa.Column('last_used_at', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['members.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['family_id'], ['families.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code_hash')
    )
    op.create_index(op.f('ix_invite_links_family_id'), 'invite_links', ['family_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_invite_links_family_id'), table_name='invite_links')
    op.drop_table('invite_links')
