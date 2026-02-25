import pytest
from playwright.sync_api import Page, expect

BASE_URL = "http://127.0.0.1:8000"

def test_login_and_navigate_dashboard(page: Page):
    page.goto(BASE_URL)
    
    # Login
    page.fill("#login-email", "admin@example.com")
    page.fill("#login-password", "admin123")
    page.click("#login-btn")
    
    # Wait for dashboard to become active
    page.wait_for_selector("#view-dashboard.active", state="visible", timeout=15000)
    expect(page.locator(".dash-page-title").first).to_be_visible()

def test_empty_state_actionable_navigation(page: Page):
    page.goto(BASE_URL)
    
    # Login
    page.fill("#login-email", "admin@example.com")
    page.fill("#login-password", "admin123")
    page.click("#login-btn")
    
    # Navigate explicitly to participants
    page.wait_for_selector("#view-dashboard.active", state="visible", timeout=15000)
    page.goto(f"{BASE_URL}/#participants")
    page.wait_for_selector("#participants-q", state="attached", timeout=10000)
    
    # Assume the search input is #participants-q (or fallback)
    # The previous component was 'input[placeholder*="Buscar"]'
    search_input = page.locator('input[placeholder*="Buscar"]').first
    search_input.wait_for(state="visible")
    search_input.fill("zzzzxxxxxxyyyyy")
    
    # Let the JS 'input' event trigger or click Apply if present
    apply_btn = page.locator('button:has-text("Aplicar")').first
    if apply_btn.is_visible():
        apply_btn.click()
    
    # Wait for Empty State
    empty_state_title = page.locator('h3:has-text("Sin resultados")').first
    empty_state_title.wait_for(state="visible", timeout=10000)
    
    # Click reset
    reset_btn = page.locator('.empty-state-action button').first
    reset_btn.click()
    
    # Table should re-render
    page.wait_for_selector('table tbody tr', state="visible", timeout=10000)
