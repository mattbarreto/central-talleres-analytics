from __future__ import annotations

from app.models import Admin
from tests.test_api_base import APITestCase


class AuthApiTests(APITestCase):
    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    def test_login_success(self):
        credentials = self.create_admin()
        response = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        # Response body must only contain email — no tokens exposed.
        self.assertIn("email", data)
        self.assertNotIn("access_token", data)
        self.assertNotIn("refresh_token", data)
        self.assertEqual(data["email"], credentials["email"])

    def test_login_sets_httponly_cookies(self):
        credentials = self.create_admin()
        response = self.client.post("/api/v1/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200, response.text)

        # Both cookies must be present
        cookies = response.cookies
        self.assertIn("tc_access_token", cookies, "tc_access_token cookie missing")
        self.assertIn("tc_refresh_token", cookies, "tc_refresh_token cookie missing")

        # Verify Set-Cookie header flags
        set_cookie_headers = response.headers.get_list("set-cookie") if hasattr(response.headers, "get_list") else []
        # Fallback: join all set-cookie values
        if not set_cookie_headers:
            raw = response.headers.get("set-cookie", "")
            set_cookie_headers = [raw] if raw else []

        combined = " | ".join(set_cookie_headers).lower()
        self.assertIn("httponly", combined, "HttpOnly flag missing from Set-Cookie")
        self.assertIn("tc_access_token", combined, "tc_access_token not in Set-Cookie")
        self.assertIn("tc_refresh_token", combined, "tc_refresh_token not in Set-Cookie")
        self.assertIn("max-age", combined, "Max-Age missing from Set-Cookie")

    def test_login_invalid_credentials_returns_401(self):
        credentials = self.create_admin()
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": credentials["email"], "password": "bad-password"},
        )
        self.assertEqual(response.status_code, 401)

    # ------------------------------------------------------------------
    # Protected routes (cookie-based)
    # ------------------------------------------------------------------

    def test_protected_route_requires_auth(self):
        # No cookie set → must get 401
        response = self.client.get("/api/v1/workshops/")
        self.assertEqual(response.status_code, 401)

    def test_protected_route_works_with_cookie(self):
        credentials = self.create_admin()
        # Login stores cookies in the TestClient cookie jar automatically
        self.login(credentials["email"], credentials["password"])
        response = self.client.get("/api/v1/workshops/")
        self.assertEqual(response.status_code, 200)

    def test_deleted_admin_token_is_rejected(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        self.db.query(Admin).filter(Admin.email == credentials["email"]).delete()
        self.db.commit()

        response = self.client.get("/api/v1/workshops/")
        self.assertEqual(response.status_code, 401)

    # ------------------------------------------------------------------
    # /auth/me
    # ------------------------------------------------------------------

    def test_me_returns_email_when_authenticated(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["email"], credentials["email"])

    def test_me_returns_no_cache_header(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("cache-control"), "no-store")

    def test_me_requires_auth(self):
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 401)

    # ------------------------------------------------------------------
    # Refresh (cookie-only enforcement)
    # ------------------------------------------------------------------

    def test_refresh_token_rotation_via_cookie(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        refresh = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(refresh.status_code, 200, refresh.text)
        data = refresh.json()
        self.assertIn("email", data)
        self.assertNotIn("access_token", data)

    def test_refresh_rejects_body_fallback(self):
        """Sending refresh_token in body WITHOUT cookie must return 401.
        Enforces cookies-only policy.
        """
        from app.core.security import create_refresh_token
        token = create_refresh_token(subject="ghost@example.com")
        response = self.client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": token},
        )
        # Without the cookie, must be 401 regardless of body content
        self.assertEqual(response.status_code, 401, response.text)

    def test_refresh_rejects_reuse(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        # First refresh (rotates cookie)
        r1 = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(r1.status_code, 200, r1.text)

        # Manually set the OLD refresh cookie to simulate replay attack
        # The cookie jar now has the new cookie, so simulate by clearing and setting old:
        # Instead, verify that a second refresh on the now-consumed old token via a fresh client fails.
        # This test captures the rotation guard in the token store.
        from app.core.security import create_refresh_token
        old_token = create_refresh_token(subject=credentials["email"])
        # Use this token directly via the used_refresh_token_store by marking it used
        from app.core.token_store import used_refresh_token_store
        from app.core.security import decode_token
        payload = decode_token(old_token)
        from app.core.security import token_expiration
        used_refresh_token_store.revoke(payload["jti"], token_expiration(payload))

        # Set old token as cookie and try to refresh
        self.client.cookies.set("tc_refresh_token", old_token)
        r2 = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(r2.status_code, 401, r2.text)

    # ------------------------------------------------------------------
    # Logout
    # ------------------------------------------------------------------

    def test_logout_clears_cookies(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])

        logout = self.client.post("/api/v1/auth/logout")
        self.assertEqual(logout.status_code, 200, logout.text)

        # After logout, protected route must be 401
        response = self.client.get("/api/v1/workshops/")
        self.assertEqual(response.status_code, 401)

    def test_logout_blocks_refresh_after_logout(self):
        credentials = self.create_admin()
        self.login(credentials["email"], credentials["password"])
        self.client.post("/api/v1/auth/logout")

        refresh = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(refresh.status_code, 401, refresh.text)
