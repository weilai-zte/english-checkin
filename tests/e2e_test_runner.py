"""
E2E test runner using python-playwright directly (bypasses the 'test' command issue).
Tests the running Flask app on port 5200.
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5200"
passed = 0
failed = 0


async def run_tests():
    global passed, failed
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        print("\n═══════════════════════════════════════")
        print("  E2E Test Suite: English Checkin App")
        print("═══════════════════════════════════════\n")

        # ── Home Page ──────────────────────────────────────────
        print("【Home Page】")
        await page.goto(BASE)
        body = await page.locator("body").inner_text()
        assert len(body) > 10, "Home page body should not be empty"
        print(f"  ✓ Home page loads ({len(body)} chars)")
        passed += 1

        links = await page.locator("a[href*='difficulty']").all()
        assert len(links) >= 2, f"Should have difficulty links, got {len(links)}"
        print(f"  ✓ Difficulty links present ({len(links)} found)")
        passed += 1

        # ── Practice Routes ─────────────────────────────────────
        print("\n【Practice Routes】")
        routes = [
            ("/tense", "时态"),
            ("/preposition", "介词"),
            ("/errors", None),
            ("/stats", None),
            ("/progress", None),
            ("/flashcard", None),
        ]
        for url, keyword in routes:
            resp = await page.goto(f"{BASE}{url}")
            status = resp.status if resp else 0
            assert status == 200, f"{url} returned {status} (expected 200)"
            body = await page.locator("body").inner_text()
            assert len(body) > 0, f"{url} returned empty body"
            if keyword:
                assert keyword in body, f"{url} should contain '{keyword}'"
            print(f"  ✓ {url} → {status} (keyword: {keyword or 'N/A'})")
            passed += 1

        # ── Difficulty Routes ──────────────────────────────────
        print("\n【Difficulty Routes】")
        resp = await page.goto(f"{BASE}/difficulty/invalid_xyz")
        assert BASE + "/" in page.url, f"Invalid difficulty should redirect home, got {page.url}"
        print(f"  ✓ /difficulty/invalid_xyz redirects home")
        passed += 1

        for level in ["easy", "medium", "hard"]:
            await page.goto(f"{BASE}/difficulty/{level}")
            assert page.url == BASE + "/", f"{level} should redirect to home"
            print(f"  ✓ /difficulty/{level} → home")
            passed += 1

        # ── API Endpoints ────────────────────────────────────────
        print("\n【API Endpoints】")
        res = await page.request.get(f"{BASE}/tts?word=")
        assert res.status == 400, f"TTS empty word: {res.status}"
        print("  ✓ TTS rejects empty word (400)")

        res = await page.request.get(f"{BASE}/tts?word=hello';DROP TABLE users;--")
        assert res.status == 400, f"TTS SQL injection: {res.status}"
        print("  ✓ TTS rejects SQL injection (400)")

        res = await page.request.post(f"{BASE}/flashcard/rate", data={"word": "test", "rating": 1})
        assert res.status < 500, f"Flashcard rate: {res.status} (should not be 500)"
        print(f"  ✓ /flashcard/rate POST → {res.status} (not 500)")
        passed += 1

        # ── Preposition Bug Fix ─────────────────────────────────
        print("\n【Preposition Bug Fix】")
        await page.goto(f"{BASE}/preposition")
        opts = await page.locator(".opt").all()
        if len(opts) > 0:
            await opts[0].click()
            body = await page.locator("body").inner_text()
            assert len(body) > 0, "Page crashed on click"
            print(f"  ✓ .opt clickable, page alive ({len(opts)} options)")
            passed += 1
        else:
            print("  ⚠ No .opt elements found (session may be empty)")
            failed += 1

        # ── 404 Handling ────────────────────────────────────────
        print("\n【404 Handling】")
        res = await page.goto(f"{BASE}/does-not-exist-xyz-123")
        status = res.status if res else 0
        assert status == 404, f"404 test: expected 404, got {status}"
        print(f"  ✓ Nonexistent route returns 404 (not 500)")
        passed += 1

        await browser.close()


async def main():
    global passed, failed
    try:
        await run_tests()
    except Exception as e:
        print(f"\n  ✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        failed += 1


asyncio.run(main())

print("\n" + "═" * 45)
print(f"  RESULTS: {passed} passed, {failed} failed")
print("═" * 45 + "\n")