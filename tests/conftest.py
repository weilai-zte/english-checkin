"""pytest 共享 fixtures

为 test_app_walkthrough.py 提供:
- app_ctx: Flask app context (激活 session/测试 client 前置)
- client: Flask test client
"""
import sys
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import app as appmod  # noqa: E402


@pytest.fixture
def app_ctx():
    """提供 Flask app context（让 session/request 可用）。"""
    with appmod.app.app_context():
        yield appmod.app


@pytest.fixture
def client(app_ctx):
    """提供 Flask test client。"""
    return appmod.app.test_client()