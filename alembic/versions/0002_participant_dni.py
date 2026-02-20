"""add participant dni

Revision ID: 0002_participant_dni
Revises: 0001_initial
Create Date: 2026-02-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_participant_dni"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("dni", sa.String(length=20), nullable=True))
    op.create_index("ix_participants_dni", "participants", ["dni"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_participants_dni", table_name="participants")
    op.drop_column("participants", "dni")
