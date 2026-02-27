from datetime import date
from tests.test_api_base import APITestCase
from app.models.workshop import Workshop
from app.models.team_member import TeamMember

class WorkshopSessionsApiTests(APITestCase):
    def test_create_session(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        workshop = Workshop(name="Taller Test", cohort_year=2026, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        fac = TeamMember(name="Profesor", role="teacher")
        self.db.add(workshop)
        self.db.add(fac)
        self.db.commit()
        self.db.refresh(workshop)
        self.db.refresh(fac)

        payload = {
            "date": "2026-05-10",
            "start_time": "18:00:00",
            "end_time": "20:00:00",
            "topic": "Tema 1: Intro",
            "facilitator_id": str(fac.id)
        }
        
        response = self.client.post(f"/api/v1/workshops/{workshop.id}/sessions", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["topic"], "Tema 1: Intro")

    def test_facilitator_overlap(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        workshop = Workshop(name="Taller Test Overlap", cohort_year=2026, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        fac = TeamMember(name="Profesor Ocupado", role="teacher")
        self.db.add(workshop)
        self.db.add(fac)
        self.db.commit()
        self.db.refresh(workshop)
        self.db.refresh(fac)

        # First session
        self.client.post(
            f"/api/v1/workshops/{workshop.id}/sessions",
            json={"date": "2026-05-10", "start_time": "18:00:00", "end_time": "20:00:00", "topic": "Clase A", "facilitator_id": str(fac.id)}
        )

        # Overlapping session (Same day, 19:00 to 21:00)
        response = self.client.post(
            f"/api/v1/workshops/{workshop.id}/sessions",
            json={"date": "2026-05-10", "start_time": "19:00:00", "end_time": "21:00:00", "topic": "Clase B", "facilitator_id": str(fac.id)}
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("superpuesta", response.text)

    def test_list_sessions_returns_404_for_missing_workshop(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])
        response = self.client.get("/api/v1/workshops/00000000-0000-0000-0000-000000000000/sessions")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Workshop not found", response.text)

    def test_update_and_delete_reject_session_from_other_workshop(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        workshop_a = Workshop(name="Taller A", cohort_year=2026, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        workshop_b = Workshop(name="Taller B", cohort_year=2026, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        self.db.add_all([workshop_a, workshop_b])
        self.db.commit()
        self.db.refresh(workshop_a)
        self.db.refresh(workshop_b)

        create_res = self.client.post(
            f"/api/v1/workshops/{workshop_a.id}/sessions",
            json={"date": "2026-06-10", "start_time": "10:00:00", "end_time": "12:00:00", "topic": "Clase Taller A"},
        )
        self.assertEqual(create_res.status_code, 200, create_res.text)
        session_id = create_res.json()["id"]

        wrong_update = self.client.put(
            f"/api/v1/workshops/{workshop_b.id}/sessions/{session_id}",
            json={"topic": "No debería actualizar"},
        )
        self.assertEqual(wrong_update.status_code, 404, wrong_update.text)
        self.assertIn("Encuentro no encontrado para este taller", wrong_update.text)

        wrong_delete = self.client.delete(f"/api/v1/workshops/{workshop_b.id}/sessions/{session_id}")
        self.assertEqual(wrong_delete.status_code, 404, wrong_delete.text)
        self.assertIn("Encuentro no encontrado para este taller", wrong_delete.text)
