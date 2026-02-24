from __future__ import annotations

from tests.test_api_base import APITestCase


class ParticipantsCsvExportTests(APITestCase):
    def test_csv_export_sanitizes_formula_like_cells(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])  # cookies stored in client jar

        create = self.client.post(
            "/api/v1/participants/",
            json={
                "name": "=2+2",
                "email": "formula@example.com",
                "phone": "+5491111111111",
            },
        )
        self.assertEqual(create.status_code, 200, create.text)

        export = self.client.get("/api/v1/participants/export.csv")
        self.assertEqual(export.status_code, 200, export.text)
        csv_text = export.text
        self.assertIn("'=2+2", csv_text)
        self.assertIn("'+5491111111111", csv_text)
