from __future__ import annotations
from datetime import datetime, timezone, timedelta
import zoneinfo
from unittest.mock import patch

from tests.test_api_base import APITestCase
from app.api.deps import get_db
from app.models import Workshop, Enrollment, Communication, Participant, WorkshopStaffAssignment

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
