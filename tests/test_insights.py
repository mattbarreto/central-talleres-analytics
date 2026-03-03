from __future__ import annotations

from datetime import date, time

from tests.test_api_base import APITestCase
from app.models import Enrollment, Participant, Workshop, WorkshopSession


class InsightsApiTests(APITestCase):
    def test_insights_overview_returns_real_metrics(self):
        credentials = self.create_admin()
        participant = self.seed_insights_data()
        self.assertIsNotNone(participant.id)
        self.login(credentials["email"], credentials["password"])

        response = self.client.get("/api/v1/insights/overview?period=monthly")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertGreaterEqual(payload["kpis"]["workshops_total"], 1)
        self.assertGreaterEqual(payload["kpis"]["enrollments_total"], 1)
        self.assertGreaterEqual(payload["kpis"]["communications_total"], 1)
        self.assertGreaterEqual(payload["kpis"]["active_team_members"], 1)
        metric_ids = {row["metric_id"] for row in payload["comparisons"]}
        self.assertIn("active_team_members", metric_ids)

    def test_participant_journey_contains_enrollments_and_communications(self):
        credentials = self.create_admin()
        participant = self.seed_insights_data()
        self.login(credentials["email"], credentials["password"])

        response = self.client.get(f"/api/v1/insights/participant-journey/{participant.id}")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertEqual(payload["participant_id"], str(participant.id))
        self.assertGreaterEqual(payload["totals"]["active"], 1)
        self.assertGreaterEqual(payload["totals"]["communications_sent"], 1)
        event_types = {event["type"] for event in payload["events"]}
        self.assertIn("enrollment", event_types)
        self.assertIn("communication", event_types)


class Stage1OperationalApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.credentials = self.create_admin()
        self.login(self.credentials["email"], self.credentials["password"])

    def _create_workshop_and_session(self, session_date: date | None = None) -> tuple[Workshop, WorkshopSession]:
        workshop = Workshop(
            name="Taller Operativo",
            cohort_year=2026,
            status="active",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )
        session = WorkshopSession(
            workshop=workshop,
            date=session_date or date(2026, 3, 4),
            start_time=time(18, 0),
            end_time=time(20, 0),
            topic="Clase de recursos",
            status="scheduled",
        )
        self.db.add_all([workshop, session])
        self.db.commit()
        self.db.refresh(workshop)
        self.db.refresh(session)
        return workshop, session

    def test_work_item_create_respond_and_events(self):
        create_response = self.client.post(
            "/api/v1/work-items/",
            json={
                "kind": "query",
                "title": "Consulta de asistencia",
                "description": "Necesita respuesta del equipo",
                "priority": "high",
            },
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        item = create_response.json()
        self.assertEqual(item["status"], "new")
        self.assertTrue(item["response_required"])

        respond_response = self.client.post(
            f"/api/v1/work-items/{item['id']}/respond",
            json={"message": "Respondido por administracion"},
        )
        self.assertEqual(respond_response.status_code, 200, respond_response.text)
        responded_item = respond_response.json()
        self.assertEqual(responded_item["status"], "triaged")
        self.assertIsNotNone(responded_item["first_response_at"])
        self.assertIsNotNone(responded_item["first_managed_at"])

        events_response = self.client.get(f"/api/v1/work-items/{item['id']}/events")
        self.assertEqual(events_response.status_code, 200, events_response.text)
        event_types = {event["event_type"] for event in events_response.json()}
        self.assertIn("created", event_types)
        self.assertIn("responded", event_types)

    def test_resource_terms_session_requirements_and_projection(self):
        workshop, session = self._create_workshop_and_session()

        create_term_response = self.client.post("/api/v1/resource-terms/", json={"label": "Proyector"})
        self.assertEqual(create_term_response.status_code, 200, create_term_response.text)
        term = create_term_response.json()
        self.assertEqual(term["scope"], "personal")

        alias_response = self.client.post(
            f"/api/v1/resource-terms/{term['id']}/aliases",
            json={"alias_label": "Canion"},
        )
        self.assertEqual(alias_response.status_code, 200, alias_response.text)

        requirements_response = self.client.put(
            f"/api/v1/workshops/{workshop.id}/sessions/{session.id}/resource-requirements",
            json=[
                {
                    "resource_term_id": term["id"],
                    "quantity_required": 2,
                    "unit": "unidad",
                    "requirement_mode": "fixed",
                    "criticality": "high",
                }
            ],
        )
        self.assertEqual(requirements_response.status_code, 200, requirements_response.text)
        rows = requirements_response.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["resource_label"], "Proyector")

        projection_response = self.client.get(
            "/api/v1/resource-projections?date_from=2026-03-01&date_to=2026-03-10&group_by=week"
        )
        self.assertEqual(projection_response.status_code, 200, projection_response.text)
        projection = projection_response.json()
        self.assertEqual(len(projection), 1)
        self.assertEqual(projection[0]["resource_label"], "Proyector")
        self.assertEqual(projection[0]["total_required"], 2.0)

    def test_interest_inference_and_weekly_snapshot_endpoints(self):
        workshop, _ = self._create_workshop_and_session(session_date=date(2026, 3, 2))
        participant = Participant(name="Participante Uno", dni="40111222", email="p1@example.com", phone="123")
        self.db.add(participant)
        self.db.flush()
        self.db.add(
            Enrollment(
                workshop_id=workshop.id,
                participant_id=participant.id,
                status="active",
            )
        )
        self.db.commit()

        term_response = self.client.post("/api/v1/interests/terms", json={"name": "Programacion"})
        self.assertEqual(term_response.status_code, 200, term_response.text)
        interest_term = term_response.json()

        links_response = self.client.put(
            f"/api/v1/interests/workshops/{workshop.id}/links",
            json=[{"interest_term_id": interest_term["id"], "weight": 1.5}],
        )
        self.assertEqual(links_response.status_code, 200, links_response.text)
        self.assertEqual(len(links_response.json()), 1)

        rebuild_response = self.client.post(
            "/api/v1/interests/inference/rebuild",
            json={"snapshot_date": "2026-03-10", "participant_id": str(participant.id)},
        )
        self.assertEqual(rebuild_response.status_code, 200, rebuild_response.text)
        rebuild_payload = rebuild_response.json()
        self.assertEqual(rebuild_payload["participants_processed"], 1)
        self.assertGreaterEqual(rebuild_payload["rows_created"], 1)

        inferred_response = self.client.get(f"/api/v1/interests/participants/{participant.id}/inferred")
        self.assertEqual(inferred_response.status_code, 200, inferred_response.text)
        inferred_payload = inferred_response.json()
        self.assertEqual(inferred_payload["participant_id"], str(participant.id))
        self.assertGreaterEqual(len(inferred_payload["rows"]), 1)

        weekly_rebuild_response = self.client.post(
            "/api/v1/executive-snapshots/weekly/rebuild",
            json={"week_start": "2026-03-02"},
        )
        self.assertEqual(weekly_rebuild_response.status_code, 200, weekly_rebuild_response.text)
        snapshot_payload = weekly_rebuild_response.json()
        self.assertEqual(snapshot_payload["week_start"], "2026-03-02")

        weekly_latest_response = self.client.get("/api/v1/executive-snapshots/weekly/latest")
        self.assertEqual(weekly_latest_response.status_code, 200, weekly_latest_response.text)
        latest_payload = weekly_latest_response.json()
        self.assertEqual(latest_payload["week_start"], "2026-03-02")

    def test_work_item_reopen_requires_resolved_or_closed_status(self):
        create_response = self.client.post(
            "/api/v1/work-items/",
            json={
                "kind": "task",
                "title": "Pendiente operativo",
            },
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        item = create_response.json()

        reopen_response = self.client.post(f"/api/v1/work-items/{item['id']}/reopen")
        self.assertEqual(reopen_response.status_code, 409, reopen_response.text)
        self.assertIn("reabrir", reopen_response.text)

    def test_resource_requirements_reject_duplicate_term_for_same_session(self):
        workshop, session = self._create_workshop_and_session()
        term_response = self.client.post("/api/v1/resource-terms/", json={"label": "Notebook"})
        self.assertEqual(term_response.status_code, 200, term_response.text)
        term_id = term_response.json()["id"]

        response = self.client.put(
            f"/api/v1/workshops/{workshop.id}/sessions/{session.id}/resource-requirements",
            json=[
                {
                    "resource_term_id": term_id,
                    "quantity_required": 1,
                    "requirement_mode": "fixed",
                    "criticality": "medium",
                },
                {
                    "resource_term_id": term_id,
                    "quantity_required": 2,
                    "requirement_mode": "fixed",
                    "criticality": "high",
                },
            ],
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("misma etiqueta", response.text)

    def test_resource_projection_rejects_invalid_date_range(self):
        response = self.client.get(
            "/api/v1/resource-projections?date_from=2026-03-10&date_to=2026-03-01&group_by=week"
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("Rango de fechas invalido", response.text)

    def test_interest_links_reject_duplicate_interest_for_same_workshop(self):
        workshop, _ = self._create_workshop_and_session()
        term_response = self.client.post("/api/v1/interests/terms", json={"name": "Robotica"})
        self.assertEqual(term_response.status_code, 200, term_response.text)
        term_id = term_response.json()["id"]

        response = self.client.put(
            f"/api/v1/interests/workshops/{workshop.id}/links",
            json=[
                {"interest_term_id": term_id, "weight": 1.0},
                {"interest_term_id": term_id, "weight": 1.2},
            ],
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("No se puede repetir", response.text)

    def test_get_inferred_interests_without_snapshot_returns_empty_payload(self):
        participant = Participant(name="Sin Historial", dni="40111333", email="sin.historial@example.com", phone="555")
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)

        response = self.client.get(f"/api/v1/interests/participants/{participant.id}/inferred")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIsNone(payload["snapshot_date"])
        self.assertEqual(payload["confidence_level"], "insufficient")
        self.assertEqual(payload["rows"], [])

    def test_weekly_latest_snapshot_returns_404_when_absent(self):
        response = self.client.get("/api/v1/executive-snapshots/weekly/latest")
        self.assertEqual(response.status_code, 404, response.text)
        self.assertIn("No hay snapshots semanales", response.text)
