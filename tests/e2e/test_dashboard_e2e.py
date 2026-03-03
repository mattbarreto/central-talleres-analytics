from playwright.sync_api import Page, expect

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.admin import Admin


BASE_URL = "http://127.0.0.1:8000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"


def ensure_admin_credentials() -> None:
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.email == ADMIN_EMAIL).first()
        password_hash = get_password_hash(ADMIN_PASSWORD)
        if admin:
            admin.password_hash = password_hash
        else:
            db.add(
                Admin(
                    email=ADMIN_EMAIL,
                    password_hash=password_hash,
                    first_name="Admin",
                    last_name="E2E",
                    role="superadmin",
                )
            )
        db.commit()
    finally:
        db.close()


def login(page: Page) -> None:
    ensure_admin_credentials()
    page.goto(BASE_URL)
    page.fill("#login-email", ADMIN_EMAIL)
    page.fill("#login-password", ADMIN_PASSWORD)
    page.click("#login-btn")
    page.wait_for_selector("#app-layout", state="visible", timeout=15000)
    page.wait_for_selector("#view-dashboard:not(.hidden)", state="visible", timeout=15000)


def test_login_and_navigate_dashboard(page: Page):
    login(page)
    expect(page.locator(".dash-page-title").first).to_be_visible()


def test_empty_state_actionable_navigation(page: Page):
    login(page)

    # Navigate explicitly to participants
    page.goto(f"{BASE_URL}/#participants")
    page.wait_for_selector("#p-q", state="visible", timeout=10000)

    search_input = page.locator("#p-q").first
    search_input.fill("zzzzxxxxxxyyyyy")

    # Let the JS 'input' event trigger or click Apply if present
    page.locator('[data-p-apply="1"]').first.click()

    # Wait for empty state
    empty_state_title = page.locator('h3:has-text("Sin personas")').first
    empty_state_title.wait_for(state="visible", timeout=10000)

    # Click reset
    reset_btn = page.locator('[data-p-reset="1"]').first
    reset_btn.click()

    # Filters should reset and keep page interactive
    expect(page.locator("#p-q")).to_have_value("")
    expect(page.locator("[data-p-apply=\"1\"]").first).to_be_visible()
