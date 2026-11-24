"""Family account records.

Revision ID: 0010
Revises: 0009
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("account_mode", sa.String(16), nullable=True))
    op.add_column("expenses", sa.Column("split_members", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("account_mode", sa.String(16), nullable=True))
    op.create_table(
        "account_contributions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("family_id", sa.String(36), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.String(36), sa.ForeignKey("members.id", ondelete="SET NULL")),
        sa.Column("amount_kop", sa.BigInteger(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_account_contributions_family_id", "account_contributions", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_account_contributions_family_id", table_name="account_contributions")
    op.drop_table("account_contributions")
    op.drop_column("payments", "account_mode")
    op.drop_column("expenses", "split_members")
    op.drop_column("expenses", "account_mode")
