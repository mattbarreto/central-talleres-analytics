"""stage 1 operational domains and index hardening

Revision ID: a12f4b9c0d11
Revises: 654cb23d35e5
Create Date: 2026-03-02 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a12f4b9c0d11"
down_revision: Union[str, None] = "654cb23d35e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Restore dropped performance indexes (c3e1169900a5)
    op.create_index("ix_workshops_status", "workshops", ["status"], unique=False)
    op.create_index("ix_workshops_cohort_year", "workshops", ["cohort_year"], unique=False)
    op.create_index("ix_enrollments_workshop_id", "enrollments", ["workshop_id"], unique=False)
    op.create_index("ix_enrollments_participant_id", "enrollments", ["participant_id"], unique=False)
    op.create_index("ix_enrollments_status", "enrollments", ["status"], unique=False)
    op.create_index("ix_enrollments_workshop_status", "enrollments", ["workshop_id", "status"], unique=False)
    op.create_index("ix_communications_workshop_id", "communications", ["workshop_id"], unique=False)
    op.create_index("ix_communications_sent_by_admin_id", "communications", ["sent_by_admin_id"], unique=False)
    op.create_index("ix_communications_sent_at", "communications", ["sent_at"], unique=False)
    op.create_index("ix_comm_recipients_communication_id", "communication_recipients", ["communication_id"], unique=False)
    op.create_index("ix_comm_recipients_participant_id", "communication_recipients", ["participant_id"], unique=False)
    op.create_index("ix_comm_recipients_status", "communication_recipients", ["status"], unique=False)
    op.create_index("ix_certificate_templates_center_id", "certificate_templates", ["center_id"], unique=False)
    op.create_index("ix_certificate_signers_template_id", "certificate_signers", ["template_id"], unique=False)
    op.create_index("ix_certificate_issues_center_id", "certificate_issues", ["center_id"], unique=False)
    op.create_index("ix_certificate_issues_issue_date", "certificate_issues", ["issue_date"], unique=False)
    op.create_index("ix_certificate_issues_participant_id", "certificate_issues", ["participant_id"], unique=False)
    op.create_index("ix_certificate_issues_template_id", "certificate_issues", ["template_id"], unique=False)
    op.create_index("ix_certificate_issues_workshop_id", "certificate_issues", ["workshop_id"], unique=False)

    op.create_table(
        "work_items",
        sa.Column("kind", sa.Enum("task", "query", "report", name="work_item_kind"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("new", "triaged", "in_progress", "waiting_response", "resolved", "closed", name="work_item_status"),
            nullable=False,
            server_default="new",
        ),
        sa.Column("priority", sa.Enum("low", "medium", "high", name="work_item_priority"), nullable=False, server_default="medium"),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("response_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_managed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_status_change_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_admin_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_admin_id", sa.Uuid(), nullable=True),
        sa.Column("workshop_id", sa.Uuid(), nullable=True),
        sa.Column("workshop_session_id", sa.Uuid(), nullable=True),
        sa.Column("participant_id", sa.Uuid(), nullable=True),
        sa.Column("team_member_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("reopen_count >= 0", name="ck_work_items_reopen_count_nonnegative"),
        sa.ForeignKeyConstraint(["assigned_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["team_member_id"], ["team_members.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workshop_session_id"], ["workshop_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_items_status_due", "work_items", ["status", "due_at"], unique=False)
    op.create_index("ix_work_items_response_pending", "work_items", ["response_required", "first_response_at", "status"], unique=False)
    op.create_index("ix_work_items_first_managed_status", "work_items", ["first_managed_at", "status"], unique=False)
    op.create_index("ix_work_items_assigned_status", "work_items", ["assigned_admin_id", "status"], unique=False)
    op.create_index("ix_work_items_workshop_session", "work_items", ["workshop_session_id"], unique=False)
    op.create_index("ix_work_items_participant", "work_items", ["participant_id"], unique=False)

    op.create_table(
        "work_item_events",
        sa.Column("work_item_id", sa.Uuid(), nullable=False),
        sa.Column("actor_admin_id", sa.Uuid(), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["actor_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_item_id"], ["work_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_item_events_item_occurred", "work_item_events", ["work_item_id", "occurred_at"], unique=False)
    op.create_index("ix_work_item_events_type_occurred", "work_item_events", ["event_type", "occurred_at"], unique=False)
    op.create_table(
        "resource_terms",
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("normalized_key", sa.String(length=120), nullable=False),
        sa.Column("scope", sa.Enum("global", "personal", name="resource_term_scope"), nullable=False, server_default="personal"),
        sa.Column(
            "governance_status",
            sa.Enum("draft", "approved", "merged", "deprecated", name="resource_term_status"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("owner_admin_id", sa.Uuid(), nullable=True),
        sa.Column("merged_into_term_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(scope = 'global' AND owner_admin_id IS NULL) OR (scope = 'personal' AND owner_admin_id IS NOT NULL)",
            name="ck_resource_terms_scope_owner",
        ),
        sa.ForeignKeyConstraint(["merged_into_term_id"], ["resource_terms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_terms_scope_status", "resource_terms", ["scope", "governance_status"], unique=False)
    op.create_index(
        "uq_resource_terms_global_key",
        "resource_terms",
        ["normalized_key"],
        unique=True,
        postgresql_where=sa.text("scope = 'global' AND governance_status != 'merged'"),
        sqlite_where=sa.text("scope = 'global' AND governance_status != 'merged'"),
    )
    op.create_index(
        "uq_resource_terms_personal_key",
        "resource_terms",
        ["normalized_key", "owner_admin_id"],
        unique=True,
        postgresql_where=sa.text("scope = 'personal' AND governance_status != 'merged'"),
        sqlite_where=sa.text("scope = 'personal' AND governance_status != 'merged'"),
    )

    op.create_table(
        "resource_term_aliases",
        sa.Column("resource_term_id", sa.Uuid(), nullable=False),
        sa.Column("alias_label", sa.String(length=120), nullable=False),
        sa.Column("normalized_alias", sa.String(length=120), nullable=False),
        sa.Column("scope", sa.Enum("global", "personal", name="resource_alias_scope"), nullable=False),
        sa.Column("owner_admin_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resource_term_id"], ["resource_terms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_term_aliases_term", "resource_term_aliases", ["resource_term_id"], unique=False)
    op.create_index("ix_resource_term_aliases_norm", "resource_term_aliases", ["normalized_alias"], unique=False)
    op.create_index(
        "uq_resource_aliases_global",
        "resource_term_aliases",
        ["normalized_alias"],
        unique=True,
        postgresql_where=sa.text("scope = 'global'"),
        sqlite_where=sa.text("scope = 'global'"),
    )
    op.create_index(
        "uq_resource_aliases_personal",
        "resource_term_aliases",
        ["normalized_alias", "owner_admin_id"],
        unique=True,
        postgresql_where=sa.text("scope = 'personal'"),
        sqlite_where=sa.text("scope = 'personal'"),
    )

    op.create_table(
        "session_resource_requirements",
        sa.Column("workshop_session_id", sa.Uuid(), nullable=False),
        sa.Column("resource_term_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_required", sa.Float(), nullable=False, server_default="1"),
        sa.Column("unit", sa.String(length=30), nullable=True),
        sa.Column("requirement_mode", sa.Enum("fixed", "per_participant", name="resource_requirement_mode"), nullable=False, server_default="fixed"),
        sa.Column("criticality", sa.Enum("low", "medium", "high", name="resource_criticality"), nullable=False, server_default="medium"),
        sa.Column("source", sa.Enum("manual", name="resource_requirement_source"), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["resource_term_id"], ["resource_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workshop_session_id"], ["workshop_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_resource_requirements_session", "session_resource_requirements", ["workshop_session_id"], unique=False)
    op.create_index("ix_session_resource_requirements_term", "session_resource_requirements", ["resource_term_id"], unique=False)
    op.create_index("ix_session_resource_requirements_session_term", "session_resource_requirements", ["workshop_session_id", "resource_term_id"], unique=True)

    op.create_table(
        "interest_terms",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("normalized_key", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interest_terms_normalized_key", "interest_terms", ["normalized_key"], unique=True)

    op.create_table(
        "workshop_interest_links",
        sa.Column("workshop_id", sa.Uuid(), nullable=False),
        sa.Column("interest_term_id", sa.Uuid(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["interest_term_id"], ["interest_terms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workshop_interest_links_workshop_term", "workshop_interest_links", ["workshop_id", "interest_term_id"], unique=True)
    op.create_index("ix_workshop_interest_links_term", "workshop_interest_links", ["interest_term_id"], unique=False)

    op.create_table(
        "participant_interest_inference_snapshots",
        sa.Column("participant_id", sa.Uuid(), nullable=False),
        sa.Column("interest_term_id", sa.Uuid(), nullable=False),
        sa.Column("window_type", sa.Enum("rolling_12m", "all_time", name="interest_window_type"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("share", sa.Float(), nullable=False),
        sa.Column("confidence_level", sa.Enum("insufficient", "low", "medium", "high", name="interest_confidence_level"), nullable=False),
        sa.Column("evidence_points", sa.Float(), nullable=False),
        sa.Column("evidence_workshops_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("methodology_version", sa.String(length=20), nullable=False, server_default="v1"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["interest_term_id"], ["interest_terms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interest_snapshots_participant_window_date", "participant_interest_inference_snapshots", ["participant_id", "window_type", "snapshot_date"], unique=False)
    op.create_index("ix_interest_snapshots_term_window_date", "participant_interest_inference_snapshots", ["interest_term_id", "window_type", "snapshot_date"], unique=False)
    op.create_index("ix_interest_snapshots_unique", "participant_interest_inference_snapshots", ["participant_id", "window_type", "snapshot_date", "interest_term_id"], unique=True)

    op.create_table(
        "weekly_executive_snapshots",
        sa.Column("scope_type", sa.Enum("institutional", "workshop", name="executive_snapshot_scope"), nullable=False, server_default="institutional"),
        sa.Column("workshop_id", sa.Uuid(), nullable=True),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("methodology_version", sa.String(length=20), nullable=False, server_default="v1"),
        sa.Column("work_items_created_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("work_items_managed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("work_items_responded_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("work_items_resolved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("work_items_closed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("work_items_reopened_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("backlog_open_end_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("backlog_unmanaged_end_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("backlog_unanswered_end_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("backlog_overdue_end_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sessions_scheduled_week_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metrics_json", sa.Text(), nullable=True),
        sa.Column("resource_projection_json", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weekly_snapshots_scope_week", "weekly_executive_snapshots", ["scope_type", "week_start"], unique=False)
    op.create_index("ix_weekly_snapshots_week", "weekly_executive_snapshots", ["week_start"], unique=False)
    op.create_index(
        "uq_weekly_snapshots_institutional_week",
        "weekly_executive_snapshots",
        ["week_start"],
        unique=True,
        postgresql_where=sa.text("scope_type = 'institutional' AND workshop_id IS NULL"),
        sqlite_where=sa.text("scope_type = 'institutional' AND workshop_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_weekly_snapshots_institutional_week", table_name="weekly_executive_snapshots")
    op.drop_index("ix_weekly_snapshots_week", table_name="weekly_executive_snapshots")
    op.drop_index("ix_weekly_snapshots_scope_week", table_name="weekly_executive_snapshots")
    op.drop_table("weekly_executive_snapshots")

    op.drop_index("ix_interest_snapshots_unique", table_name="participant_interest_inference_snapshots")
    op.drop_index("ix_interest_snapshots_term_window_date", table_name="participant_interest_inference_snapshots")
    op.drop_index("ix_interest_snapshots_participant_window_date", table_name="participant_interest_inference_snapshots")
    op.drop_table("participant_interest_inference_snapshots")

    op.drop_index("ix_workshop_interest_links_term", table_name="workshop_interest_links")
    op.drop_index("ix_workshop_interest_links_workshop_term", table_name="workshop_interest_links")
    op.drop_table("workshop_interest_links")

    op.drop_index("ix_interest_terms_normalized_key", table_name="interest_terms")
    op.drop_table("interest_terms")

    op.drop_index("ix_session_resource_requirements_session_term", table_name="session_resource_requirements")
    op.drop_index("ix_session_resource_requirements_term", table_name="session_resource_requirements")
    op.drop_index("ix_session_resource_requirements_session", table_name="session_resource_requirements")
    op.drop_table("session_resource_requirements")

    op.drop_index("uq_resource_aliases_personal", table_name="resource_term_aliases")
    op.drop_index("uq_resource_aliases_global", table_name="resource_term_aliases")
    op.drop_index("ix_resource_term_aliases_norm", table_name="resource_term_aliases")
    op.drop_index("ix_resource_term_aliases_term", table_name="resource_term_aliases")
    op.drop_table("resource_term_aliases")

    op.drop_index("uq_resource_terms_personal_key", table_name="resource_terms")
    op.drop_index("uq_resource_terms_global_key", table_name="resource_terms")
    op.drop_index("ix_resource_terms_scope_status", table_name="resource_terms")
    op.drop_table("resource_terms")

    op.drop_index("ix_work_item_events_type_occurred", table_name="work_item_events")
    op.drop_index("ix_work_item_events_item_occurred", table_name="work_item_events")
    op.drop_table("work_item_events")

    op.drop_index("ix_work_items_participant", table_name="work_items")
    op.drop_index("ix_work_items_workshop_session", table_name="work_items")
    op.drop_index("ix_work_items_assigned_status", table_name="work_items")
    op.drop_index("ix_work_items_first_managed_status", table_name="work_items")
    op.drop_index("ix_work_items_response_pending", table_name="work_items")
    op.drop_index("ix_work_items_status_due", table_name="work_items")
    op.drop_table("work_items")

    op.drop_index("ix_certificate_issues_workshop_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_template_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_participant_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_issue_date", table_name="certificate_issues")
    op.drop_index("ix_certificate_issues_center_id", table_name="certificate_issues")
    op.drop_index("ix_certificate_signers_template_id", table_name="certificate_signers")
    op.drop_index("ix_certificate_templates_center_id", table_name="certificate_templates")
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
