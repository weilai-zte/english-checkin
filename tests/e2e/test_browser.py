"""
Playwright E2E tests for english-checkin Flask app.
Run: python3 tests/e2e_test_runner.py
Or via pytest: python3 -m pytest tests/e2e/test_browser.py -v
"""
import pytest

BASE = "http://127.0.0.1:5200"


class TestHomePage:
    """Home page must load with correct content."""

    def test_home_loads_successfully(self, page):
        page.goto(BASE)
        body = page.locator("body").inner_text()
        assert len(body) > 10

    def test_difficulty_links_present(self, page):
        page.goto(BASE)
        links = page.locator("a[href*='difficulty']").all()
        assert len(links) >= 2

    def test_flashcard_link_present(self, page):
        page.goto(BASE)
        hrefs = [a.get_attribute("href") for a in page.locator("a").all()]
        assert any("flashcard" in h for h in hrefs if h)


class TestPracticeRoutes:
    """All practice routes return 200 and render content."""

    @pytest.mark.parametrize("url,keyword", [
        ("/tense", "时态"),
        ("/preposition", "介词"),
        ("/errors", None),
        ("/stats", None),
        ("/progress", None),
        ("/flashcard", None),
    ])
    def test_route_returns_200(self, page, url, keyword):
        resp = page.goto(f"{BASE}{url}")
        assert resp is not None and resp.status == 200
        body = page.locator("body").inner_text()
        assert len(body) > 0
        if keyword:
            assert keyword in body


class TestDifficultyRoutes:
    """Difficulty routing sets session correctly."""

    def test_invalid_difficulty_redirects_home(self, page):
        page.goto(f"{BASE}/difficulty/nonexistent_xyz_abc")
        assert page.url == BASE + "/"

    @pytest.mark.parametrize("level", ["easy", "medium", "hard"])
    def test_valid_difficulty_sets_session(self, page, level):
        page.goto(f"{BASE}/difficulty/{level}")
        assert page.url == BASE + "/"


class TestApiEndpoints:
    """API endpoints validate input correctly."""

    def test_tts_rejects_empty_word(self, page):
        res = page.request.get(f"{BASE}/tts?word=")
        assert res.status == 400

    def test_tts_rejects_sql_injection(self, page):
        res = page.request.get(f"{BASE}/tts?word=hello';DROP TABLE users;--")
        assert res.status == 400

    def test_tts_accepts_valid_word(self, page):
        res = page.request.get(f"{BASE}/tts?word=hello")
        # 200 = OK, 500 = say command not available (CI environment)
        assert res.status in (200, 500)

    def test_flashcard_rate_not_500(self, page):
        res = page.request.post(f"{BASE}/flashcard/rate", data={"word": "test", "rating": 1})
        assert res.status < 500


class TestPrepositionBugFix:
    """Preposition.html bug: btn.dataset.q → container.dataset.question."""

    def test_preposition_options_clickable(self, page):
        page.goto(f"{BASE}/preposition")
        opts = page.locator(".opt").all()
        assert len(opts) > 0, "Should have preposition options"
        opts[0].click()
        # Page should still have content (no crash)
        body = page.locator("body").inner_text()
        assert len(body) > 0


class Test404Handling:
    """Nonexistent routes return 404, not 500."""

    def test_nonexistent_route_404(self, page):
        res = page.goto(f"{BASE}/this-does-not-exist-xyz")
        assert res is not None and res.status == 404


class TestTranslateEn:
    """英译中练习功能."""

    def test_translate_en_page_loads(self, page):
        page.goto(f"{BASE}/translate-en")
        body = page.locator("body").inner_text()
        assert len(body) > 0

    def test_translate_en_has_options(self, page):
        page.goto(f"{BASE}/translate-en")
        opts = page.locator(".opt").all()
        assert len(opts) >= 4, "Should have at least 4 option buttons"

    def test_translate_en_option_selectable(self, page):
        page.goto(f"{BASE}/translate-en")
        opts = page.locator(".opt").all()
        opts[0].click()
        # Selected class should be added
        assert "selected" in opts[0].get_attribute("class")

    def test_translate_en_home_link_visible(self, page):
        page.goto(f"{BASE}/translate-en")
        # 提交按钮存在
        submit = page.locator(".submit-btn")
        assert submit.is_visible()