"""add persistent report jobs table

Revision ID: 0006_report_jobs
Revises: 0005_certificates_and_indexes
Create Date: 2026-02-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_report_jobs"
down_revision = "0005_certificates_and_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("media_type", sa.String(length=120), nullable=True),
    )
    op.create_index("ix_report_jobs_status", "report_jobs", ["status"], unique=False)
    op.create_index("ix_report_jobs_created_at", "report_jobs", ["created_at"], unique=False)
    op.create_index("ix_report_jobs_updated_at", "report_jobs", ["updated_at"], unique=False)
    op.create_index("ix_report_jobs_expires_at", "report_jobs", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_report_jobs_expires_at", table_name="report_jobs")
    op.drop_index("ix_report_jobs_updated_at", table_name="report_jobs")
    op.drop_index("ix_report_jobs_created_at", table_name="report_jobs")
    op.drop_index("ix_report_jobs_status", table_name="report_jobs")
    op.drop_table("report_jobs")
