"""add participant demographics

Revision ID: 0003_participant_demographics
Revises: 0002_participant_dni
Create Date: 2026-02-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_participant_demographics"
down_revision = "0002_participant_dni"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("participants", sa.Column("gender", sa.String(length=20), nullable=True))
    op.execute("UPDATE participants SET gender = 'undisclosed' WHERE gender IS NULL")


def downgrade() -> None:
    op.drop_column("participants", "gender")
    op.drop_column("participants", "birth_date")
