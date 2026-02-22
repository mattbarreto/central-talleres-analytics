from __future__ import annotations

from tests.test_api_base import APITestCase


class AdminsApiTests(APITestCase):
    def test_create_admin_rejects_short_password(self):
        credentials = self.create_admin()
        token_data = self.login(credentials["email"], credentials["password"])
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}

        response = self.client.post(
            "/api/v1/admins/",
            headers=headers,
            json={"email": "nuevo.admin@example.com", "password": "1234567"},
        )
        self.assertEqual(response.status_code, 422, response.text)
