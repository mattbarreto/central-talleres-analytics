"""add team members and workshop staff assignments

Revision ID: 0004_team_members
Revises: 0003_participant_demographics
Create Date: 2026-02-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_team_members"
down_revision = "0003_participant_demographics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("role", sa.Enum("teacher", "coordinator", name="team_member_role"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_team_members_email", "team_members", ["email"], unique=False)

    op.create_table(
        "workshop_staff_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workshop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_member_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignment_role", sa.Enum("teacher", "coordinator", name="assignment_role"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["team_member_id"], ["team_members.id"]),
        sa.UniqueConstraint("workshop_id", "team_member_id", name="uq_workshop_team_member"),
    )
    op.create_index("ix_workshop_staff_assignments_workshop_id", "workshop_staff_assignments", ["workshop_id"], unique=False)
    op.create_index("ix_workshop_staff_assignments_team_member_id", "workshop_staff_assignments", ["team_member_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_workshop_staff_assignments_team_member_id", table_name="workshop_staff_assignments")
    op.drop_index("ix_workshop_staff_assignments_workshop_id", table_name="workshop_staff_assignments")
    op.drop_table("workshop_staff_assignments")
    op.drop_index("ix_team_members_email", table_name="team_members")
    op.drop_table("team_members")

    op.execute("DROP TYPE IF EXISTS assignment_role")
    op.execute("DROP TYPE IF EXISTS team_member_role")
