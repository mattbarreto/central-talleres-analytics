"""add certificates tables and performance indexes

Revision ID: 0005_certificates_and_indexes
Revises: 0004_team_members
Create Date: 2026-02-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_certificates_and_indexes"
down_revision = "0004_team_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "certificate_centers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("legal_name", sa.String(length=300), nullable=True),
        sa.Column("logo_data_url", sa.Text(), nullable=True),
        sa.Column("primary_color", sa.String(length=20), nullable=False, server_default="#2D5BFF"),
        sa.Column("secondary_color", sa.String(length=20), nullable=False, server_default="#0F172A"),
        sa.Column("watermark_text", sa.String(length=200), nullable=False, server_default="Certificado"),
        sa.Column("watermark_opacity", sa.Float(), nullable=False, server_default="0.08"),
        sa.Column("footer_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "certificate_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("orientation", sa.String(length=20), nullable=False, server_default="landscape"),
        sa.Column("paper_size", sa.String(length=20), nullable=False, server_default="A4"),
        sa.Column("title_text", sa.String(length=200), nullable=False, server_default="Certificado de participación"),
        sa.Column("subtitle_text", sa.String(length=300), nullable=True),
        sa.Column(
            "body_template",
            sa.Text(),
            nullable=False,
            server_default="Se certifica que {participant_name} completó el curso/taller {course_name}.",
        ),
        sa.Column("default_description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["center_id"], ["certificate_centers.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "certificate_signers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role_title", sa.String(length=200), nullable=False),
        sa.Column("signature_data_url", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["certificate_templates.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "certificate_issues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("verification_code", sa.String(length=40), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workshop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("course_name", sa.String(length=240), nullable=False),
        sa.Column("course_description", sa.Text(), nullable=True),
        sa.Column("issued_payload_json", sa.Text(), nullable=False),
        sa.Column("pdf_path", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["center_id"], ["certificate_centers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["certificate_templates.id"], ondelete="RESTRICT"),
    )

    op.create_index("ix_certificate_templates_center_id", "certificate_templates", ["center_id"], unique=False)
    op.create_index("ix_certificate_signers_template_id", "certificate_signers", ["template_id"], unique=False)
    op.create_index("ix_certificate_issues_verification_code", "certificate_issues", ["verification_code"], unique=True)
    op.create_index("ix_certificate_issues_participant_id", "certificate_issues", ["participant_id"], unique=False)
    op.create_index("ix_certificate_issues_workshop_id", "certificate_issues", ["workshop_id"], unique=False)
    op.create_index("ix_certificate_issues_center_id", "certificate_issues", ["center_id"], unique=False)
    op.create_index("ix_certificate_issues_template_id", "certificate_issues", ["template_id"], unique=False)
    op.create_index("ix_certificate_issues_issue_date", "certificate_issues", ["issue_date"], unique=False)

    # Performance indexes for common filters/joins
    op.create_index("ix_workshops_status", "workshops", ["status"], unique=False)
    op.create_index("ix_workshops_cohort_year", "workshops", ["cohort_year"], unique=False)
    op.create_index("ix_enrollments_workshop_id", "enrollments", ["workshop_id"], unique=False)
    op.create_index("ix_enrollments_participant_id", "enrollments", ["participant_id"], unique=False)
    op.create_index("ix_enrollments_status", "enrollments", ["status"], unique=False)
    op.create_index(
        "ix_enrollments_workshop_status",
        "enrollments",
        ["workshop_id", "status"],
        unique=False,
    )
    op.create_index("ix_communications_workshop_id", "communications", ["workshop_id"], unique=False)
    op.create_index("ix_communications_sent_by_admin_id", "communications", ["sent_by_admin_id"], unique=False)
    op.create_index("ix_communications_sent_at", "communications", ["sent_at"], unique=False)
    op.create_index("ix_comm_recipients_communication_id", "communication_recipients", ["communication_id"], unique=False)
    op.create_index("ix_comm_recipients_participant_id", "communication_recipients", ["participant_id"], unique=False)
    op.create_index("ix_comm_recipients_status", "communication_recipients", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_comm_recipients_status", table_name="communication_recipients")
    op.drop_index("ix_comm_recipients_participant_id", table_name="communication_recipients")
    op.drop_index("ix_comm_recipients_communication_id", table_name="communication_recipients")
    op.drop_index("ix_communications_sent_at", table_name="communications")
    op.drop_index("ix_communications_sent_by_admin_id", table_name="communications")
    op.drop_index("ix_communications_workshop_id", table_name="communications")
    op.drop_index("ix_enrollments_workshop_status", table_name="enrollments")
    op.drop_index("ix_enrollments_status", table_name="enrollments")
    op.drop_index("ix_enrollments_participant_id", table_name="enrollments")
    op.drop_index("ix_enrollments_workshop_id", table_name="enrollments")
    op.drop_index("ix_workshops_cohort_year", table_name="workshops")
    op.drop_index("ix_workshops_status", table_name="workshops")

    op.drop_index("ix_certificate_issues_issue_date", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_template_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_center_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_workshop_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_participant_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_verification_code", table_name="certificate_issues")
    op.drop_index("ix_certificate_signers_template_id", table_name="certificate_signers")
    op.drop_index("ix_certificate_templates_center_id", table_name="certificate_templates")

    op.drop_table("certificate_issues")
    op.drop_table("certificate_signers")
    op.drop_table("certificate_templates")
    op.drop_table("certificate_centers")

