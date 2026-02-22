from __future__ import annotations

from tests.test_api_base import APITestCase


class WorkshopsApiTests(APITestCase):
    def test_create_and_get_workshop(self):
        credentials = self.create_admin()
        headers = self.auth_headers(credentials["email"], credentials["password"])
        payload = {
            "name": "Taller Python",
            "cohort_year": 2026,
            "status": "planned",
            "start_date": "2026-03-01",
            "end_date": "2026-06-30",
        }
        create = self.client.post("/api/v1/workshops/", json=payload, headers=headers)
        self.assertEqual(create.status_code, 200, create.text)
        workshop = create.json()

        get_one = self.client.get(f"/api/v1/workshops/{workshop['id']}", headers=headers)
        self.assertEqual(get_one.status_code, 200, get_one.text)
        self.assertEqual(get_one.json()["name"], payload["name"])

    def test_workshops_pagination(self):
        credentials = self.create_admin()
        headers = self.auth_headers(credentials["email"], credentials["password"])
        for idx in range(5):
            payload = {
                "name": f"Taller {idx}",
                "cohort_year": 2026,
                "status": "planned",
                "start_date": "2026-01-01",
                "end_date": "2026-02-01",
            }
            response = self.client.post("/api/v1/workshops/", json=payload, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)

        page = self.client.get("/api/v1/workshops/?skip=1&limit=2", headers=headers)
        self.assertEqual(page.status_code, 200, page.text)
        self.assertEqual(len(page.json()), 2)

    def test_logout_revokes_token(self):
        credentials = self.create_admin()
        headers = self.auth_headers(credentials["email"], credentials["password"])

        logout = self.client.post("/api/v1/auth/logout", headers=headers)
        self.assertEqual(logout.status_code, 200, logout.text)

        protected = self.client.get("/api/v1/workshops/", headers=headers)
        self.assertEqual(protected.status_code, 401, protected.text)
