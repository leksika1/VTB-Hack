"""Persist expense shares and link new savings to account contributions."""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("split_percentages", sa.JSON(), nullable=True))
    op.add_column("account_contributions", sa.Column("goal_contribution_id", sa.String(36), nullable=True))
    op.create_foreign_key(
        "fk_account_contributions_goal_contribution", "account_contributions", "goal_contributions",
        ["goal_contribution_id"], ["id"], ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_account_contributions_goal_contribution", "account_contributions", ["goal_contribution_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_account_contributions_goal_contribution", "account_contributions", type_="unique")
    op.drop_constraint("fk_account_contributions_goal_contribution", "account_contributions", type_="foreignkey")
    op.drop_column("account_contributions", "goal_contribution_id")
    op.drop_column("expenses", "split_percentages")
