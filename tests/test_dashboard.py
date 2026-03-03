from __future__ import annotations
from datetime import date, datetime, time, timezone, timedelta
import zoneinfo
from unittest.mock import patch

from tests.test_api_base import APITestCase
from app.api.deps import get_db
from app.models import (
    Communication,
    Enrollment,
    Participant,
    ResourceTerm,
    SessionResourceRequirement,
    TeamMember,
    WorkItem,
    Workshop,
    WorkshopSession,
    WorkshopStaffAssignment,
)

TZ = zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")


class DashboardApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.credentials = self.create_admin()
        self.login(self.credentials["email"], self.credentials["password"])

        # Create base test data
        w1 = Workshop(name="W1", cohort_year=2024, status="active")
        w2 = Workshop(name="W2", cohort_year=2024, status="finished")
        self.db.add_all([w1, w2])
        self.db.commit()
        
        self.w1 = w1
        self.w2 = w2

    @patch("app.api.routes.dashboard.datetime")
    def test_dashboard_metrics_basic_schema_and_counts(self, mock_dt):
        # Freeze time to noon UTC today
        now = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
        mock_dt.now.return_value = now
        mock_dt.timedelta = timedelta
        
        # Clear existing seeded data from APITestCase to avoid interference
        self.db.query(WorkshopStaffAssignment).delete()
        self.db.query(Enrollment).delete()
        self.db.query(Communication).delete()
        self.db.query(Workshop).delete()
        self.db.query(Participant).delete()
        self.db.commit()

        # Re-add w1, w2 cleanly
        w1_new = Workshop(name="W1_new", cohort_year=2024, status="active")
        w2_new = Workshop(name="W2_new", cohort_year=2024, status="finished")
        self.db.add_all([w1_new, w2_new])
        self.db.commit()

        # Ensure base data is within the current 30 day window
        w1_new.created_at = now - timedelta(days=5)
        w2_new.created_at = now - timedelta(days=25)
        self.db.commit()

        # Add participant and 2 enrollments (to test unique participant count)
        p = Participant(name="P", email="p@local", phone="123")
        self.db.add(p)
        self.db.commit()

        e1 = Enrollment(workshop_id=w1_new.id, participant_id=p.id, status="active")
        e2 = Enrollment(workshop_id=w2_new.id, participant_id=p.id, status="finished")
        e1.created_at = now - timedelta(days=2)
        e2.created_at = now - timedelta(days=20)
        self.db.add_all([e1, e2])
        self.db.commit()
        
        # Add comm
        c = Communication(workshop_id=w1_new.id, subject="s", body="b")
        c.created_at = now - timedelta(days=10)
        self.db.add(c)
        self.db.commit()

        resp = self.client.get("/api/v1/dashboard/metrics?range_days=30")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # Check Meta
        meta = data["meta"]
        self.assertEqual(meta["range_days"], 30)
        self.assertEqual(meta["timezone"], "America/Argentina/Buenos_Aires")

        # Check APIs
        kpis = data["kpis"]
        self.assertEqual(kpis["workshops"]["current"], 2)
        self.assertEqual(kpis["workshops"]["previous"], 0)
        
        self.assertEqual(kpis["enrollments"]["current"], 2)
        self.assertEqual(kpis["participants_unique"]["current"], 1) # one participant, 2 enrollments
        
        self.assertEqual(kpis["active_enrollments"]["current"], 1)
        self.assertEqual(kpis["finished_enrollments"]["current"], 1)
        
        self.assertEqual(kpis["communications"]["current"], 1)

        # Check Top Workshops (ranking)
        top = data["top_workshops"]
        self.assertEqual(len(top), 2) # W1 and W2 both have 1 enrollment
        
        # Check Recent Activity
        recent = data["recent_activity"]
        self.assertGreater(len(recent), 0)
        self.assertIn("workshop", [r["type"] for r in recent])
        self.assertIn("communication", [r["type"] for r in recent])

    def test_dashboard_metrics_rejects_invalid_range(self):
        resp_too_small = self.client.get("/api/v1/dashboard/metrics?range_days=5")
        self.assertEqual(resp_too_small.status_code, 422) # FastAPI validation error
        
        resp_too_large = self.client.get("/api/v1/dashboard/metrics?range_days=5000")
        self.assertEqual(resp_too_large.status_code, 422)


class OperationsTacticalApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.credentials = self.create_admin()
        self.login(self.credentials["email"], self.credentials["password"])

    def test_operations_tactical_returns_today_tomorrow_week_and_attention(self):
        today = date.today()
        tomorrow = today + timedelta(days=1)
        now = datetime.now(timezone.utc)

        workshop = Workshop(
            name="Taller Coordinacion",
            cohort_year=today.year,
            status="active",
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=60),
        )
        teacher = TeamMember(name="Docente Operativo", role="teacher", email="docente@ops.test")
        participant = Participant(name="Participante Ops", email="ops@example.com", phone="123")

        self.db.add_all([workshop, teacher, participant])
        self.db.flush()

        self.db.add(
            Enrollment(
                workshop_id=workshop.id,
                participant_id=participant.id,
                status="active",
            )
        )

        today_session = WorkshopSession(
            workshop_id=workshop.id,
            date=today,
            start_time=time(10, 0),
            end_time=time(12, 0),
            topic="Laboratorio",
            facilitator_id=teacher.id,
            status="scheduled",
        )
        tomorrow_session = WorkshopSession(
            workshop_id=workshop.id,
            date=tomorrow,
            start_time=time(9, 0),
            end_time=time(11, 0),
            topic="Sin tema",
            facilitator_id=None,
            status="scheduled",
        )
        self.db.add_all([today_session, tomorrow_session])
        self.db.flush()

        term = ResourceTerm(
            label="Proyector",
            normalized_key="proyector",
            scope="global",
            governance_status="approved",
            owner_admin_id=None,
        )
        self.db.add(term)
        self.db.flush()

        self.db.add(
            SessionResourceRequirement(
                workshop_session_id=today_session.id,
                resource_term_id=term.id,
                quantity_required=1,
                unit="unidad",
                requirement_mode="fixed",
                criticality="high",
                source="manual",
            )
        )

        self.db.add_all(
            [
                WorkItem(
                    kind="task",
                    status="in_progress",
                    priority="high",
                    title="Pendiente vencido",
                    description="Atender urgente",
                    response_required=False,
                    due_at=now - timedelta(days=1),
                    first_managed_at=now - timedelta(days=2),
                    first_response_at=None,
                    resolved_at=None,
                    closed_at=None,
                    reopened_at=None,
                    reopen_count=0,
                    last_status_change_at=now - timedelta(days=1),
                    workshop_id=workshop.id,
                    workshop_session_id=today_session.id,
                ),
                WorkItem(
                    kind="query",
                    status="triaged",
                    priority="medium",
                    title="Pendiente sin responder",
                    description="Responder hoy",
                    response_required=True,
                    due_at=now,
                    first_managed_at=now - timedelta(hours=3),
                    first_response_at=None,
                    resolved_at=None,
                    closed_at=None,
                    reopened_at=None,
                    reopen_count=0,
                    last_status_change_at=now - timedelta(hours=2),
                    workshop_id=workshop.id,
                    workshop_session_id=tomorrow_session.id,
                ),
            ]
        )

        self.db.commit()

        response = self.client.get("/api/v1/operations/tactical")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertIn("today", payload)
        self.assertIn("tomorrow", payload)
        self.assertIn("week", payload)
        self.assertIn("attention_required", payload)
        self.assertIn("pending", payload)

        self.assertEqual(payload["today"]["summary"]["sessions_count"], 1)
        self.assertEqual(payload["tomorrow"]["summary"]["sessions_count"], 1)
        self.assertGreaterEqual(payload["week"]["summary"]["sessions_count"], 2)

        today_sessions = payload["today"]["sessions"]
        self.assertEqual(len(today_sessions), 1)
        self.assertEqual(today_sessions[0]["resources"][0]["resource_label"], "Proyector")

        attention_kinds = {item["kind"] for item in payload["attention_required"]}
        self.assertIn("missing_facilitator", attention_kinds)
        self.assertIn("overdue_work_item", attention_kinds)

        self.assertGreaterEqual(payload["pending"]["overdue"]["count"], 1)
        self.assertGreaterEqual(payload["pending"]["unanswered"]["count"], 1)
