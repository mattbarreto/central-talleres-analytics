from __future__ import annotations

from tests.test_api_base import APITestCase


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
