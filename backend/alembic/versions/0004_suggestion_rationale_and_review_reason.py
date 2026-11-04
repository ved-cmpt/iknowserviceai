"""add rationale and review reason to ai_suggestions

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ai_suggestions", sa.Column("rationale_short", sa.Text(), nullable=True))
    op.add_column("ai_suggestions", sa.Column("review_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_suggestions", "review_reason")
    op.drop_column("ai_suggestions", "rationale_short")
