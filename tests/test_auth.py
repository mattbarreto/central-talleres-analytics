from __future__ import annotations

from app.models import Admin
from tests.test_api_base import APITestCase


class AuthApiTests(APITestCase):
    def test_login_success(self):
        credentials = self.create_admin()
        response = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["token_type"], "bearer")
        self.assertTrue(isinstance(data["access_token"], str) and data["access_token"])
        self.assertTrue(isinstance(data["refresh_token"], str) and data["refresh_token"])

    def test_login_invalid_credentials_returns_401(self):
        credentials = self.create_admin()
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": credentials["email"], "password": "bad-password"},
        )
        self.assertEqual(response.status_code, 401)

    def test_protected_route_requires_auth(self):
        response = self.client.get("/api/v1/workshops/")
        self.assertEqual(response.status_code, 401)

    def test_deleted_admin_token_is_rejected(self):
        credentials = self.create_admin()
        token_data = self.login(credentials["email"], credentials["password"])
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}

        self.db.query(Admin).filter(Admin.email == credentials["email"]).delete()
        self.db.commit()

        response = self.client.get("/api/v1/workshops/", headers=headers)
        self.assertEqual(response.status_code, 401)

    def test_refresh_token_rotation_and_reuse_blocked(self):
        credentials = self.create_admin()
        login = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(login.status_code, 200, login.text)
        refresh_token = login.json()["refresh_token"]

        refresh = self.client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        self.assertEqual(refresh.status_code, 200, refresh.text)
        rotated = refresh.json()
        self.assertNotEqual(rotated["refresh_token"], refresh_token)
        self.assertTrue(rotated["access_token"])

        replay = self.client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        self.assertEqual(replay.status_code, 401, replay.text)

    def test_logout_refresh_token_blocks_future_refresh(self):
        credentials = self.create_admin()
        login = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(login.status_code, 200, login.text)
        refresh_token = login.json()["refresh_token"]

        logout = self.client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {refresh_token}"})
        self.assertEqual(logout.status_code, 200, logout.text)

        refresh = self.client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        self.assertEqual(refresh.status_code, 401, refresh.text)

    def test_logout_with_access_token_and_body_revokes_refresh(self):
        credentials = self.create_admin()
        login = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(login.status_code, 200, login.text)
        access_token = login.json()["access_token"]
        refresh_token = login.json()["refresh_token"]

        logout = self.client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"refresh_token": refresh_token},
        )
        self.assertEqual(logout.status_code, 200, logout.text)

        refresh = self.client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        self.assertEqual(refresh.status_code, 401, refresh.text)
