"""Exercise the static English-to-Chinese flow without touching real progress."""
import functools
import http.server
import json
import shutil
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope='module')
def static_site():
    directory = Path(__file__).resolve().parents[2] / 'site_static' / 'dist'
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown()
    thread.join()
    server.server_close()


@pytest.fixture
def isolated_page():
    chrome = shutil.which('google-chrome')
    mac_chrome = Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    if not chrome and mac_chrome.exists():
        chrome = str(mac_chrome)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=chrome)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        yield context.new_page()
        context.close()
        browser.close()


@pytest.mark.parametrize('grade', ['g7', 'g8', 'g9'])
def test_translation_requires_self_review_before_saving(isolated_page, static_site, grade):
    page = isolated_page
    page.route('**/*supabase.co/**', lambda route: route.abort())
    page.add_init_script(f"localStorage.setItem('ck_progress_v1', JSON.stringify({{school_grade: '{grade}', user_name: '测试'}}));")
    page.add_locator_handler(page.locator('#account-modal .modal-x'), lambda close: close.click())
    page.goto(static_site + '/#/translate-en')
    page.wait_for_selector('#reading-submit')
    page.wait_for_timeout(1800)
    close = page.locator('#account-modal .modal-x')
    if close.is_visible():
        close.click()

    cards = page.locator('#reading-list .card')
    assert cards.count() == 10
    sentences = [card.locator('.quiz-word').inner_text().strip().lower() for card in cards.all()]
    assert len(sentences) == len(set(sentences))
    writing = page.locator('#reading-list textarea')
    assert writing.count() == 5
    assert page.locator('#reading-list .mcq-list').count() == 5
    assert page.locator('#reading-list .grammar-result:visible').count() == 0
    for field in writing.all():
        field.fill('我自己的中文翻译')
    for card in cards.all():
        options = card.locator('input[type=radio]')
        if options.count():
            options.first.check()

    page.locator('#reading-submit').click()
    assert page.locator('#reading-list .grammar-result:visible').count() == 10
    finish = page.locator('#reading-finish')
    finish.click()
    assert finish.is_visible()  # Self-assessment must be completed first.
    reviews = page.locator('[role=group][aria-label*="自评"]')
    assert reviews.count() == 5
    reviews.nth(0).locator('[data-review=correct]').click()
    reviews.nth(1).locator('[data-review=wrong]').click()
    for index in range(2, 5):
        reviews.nth(index).locator('[data-review=correct]').click()
    page.wait_for_timeout(1800)  # First-visit account prompt may appear after boot.
    if close.is_visible():
        close.click()
    finish.click()
    assert not finish.is_visible()
    progress = json.loads(page.evaluate("localStorage.getItem('ck_progress_v1')"))
    assert any(item.get('type') == 'translate_en' and item.get('user') == '我自己的中文翻译'
               and item.get('answer') and item.get('hint') for item in progress['wrong_grammar'])
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
