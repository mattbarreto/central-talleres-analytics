from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.api.routes.metrics import _dashboard_dataset
from app.models import Communication, Enrollment, Participant, Workshop
from tests.test_api_base import APITestCase


class MetricsDatasetTests(APITestCase):
    def test_dashboard_dataset_keeps_recent_activity_for_old_workshops(self):
        old_workshop = Workshop(
            name="Taller historico",
            cohort_year=2024,
            status="active",
        )
        participant = Participant(
            name="Persona Activa",
            email="persona.activa@example.com",
        )
        self.db.add_all([old_workshop, participant])
        self.db.flush()

        old_workshop.created_at = datetime.now(UTC) - timedelta(days=180)
        recent = datetime.now(UTC) - timedelta(days=2)
        enrollment = Enrollment(
            workshop_id=old_workshop.id,
            participant_id=participant.id,
            status="active",
            created_at=recent,
        )
        communication = Communication(
            workshop_id=old_workshop.id,
            subject="Seguimiento",
            body="Mensaje de prueba",
            created_at=recent,
        )
        self.db.add_all([enrollment, communication])
        self.db.commit()

        workshops, enrollments, communications = _dashboard_dataset(
            self.db,
            range_key="30d",
            year=None,
            status=None,
            workshop_id=None,
        )

        self.assertTrue(any(w.id == old_workshop.id for w in workshops))
        self.assertEqual(len(enrollments), 1)
        self.assertEqual(len(communications), 1)
