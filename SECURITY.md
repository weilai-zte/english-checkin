# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| v0.12.x | ✅ Active          |
| v0.11.x | ⚠️ Best effort     |
| < v0.11  | ❌ End of life     |

---

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities via public GitHub issues.**

Instead, please report them privately to:

- **Email**: 5-529@163.com
- **Subject prefix**: `[SECURITY] english-checkin`
- **PGP key**: _(not currently available — please use email)_

### What to include

Please include the following information to help us triage:

1. **Type of vulnerability** (e.g., XSS, SQL injection, auth bypass)
2. **Affected component** (Flask app, Netlify static, send_daily.py cron, etc.)
3. **Affected versions** (e.g., v0.12.0 only, or v0.11.x too)
4. **Steps to reproduce** (minimal code/config to trigger)
5. **Impact assessment** (what data/functionality is at risk)
6. **Suggested fix** (optional but appreciated)

### Response time

- **Initial response**: within 7 days
- **Status update**: every 14 days until resolution
- **Fix timeline**: depends on severity
  - **Critical** (data breach, auth bypass): < 7 days
  - **High** (XSS in public site, webhook leak): < 30 days
  - **Medium** (information disclosure): < 90 days
  - **Low** (theoretical / requires unlikely conditions): best effort

---

## Security Considerations for english-checkin

### Current architecture (v0.12.x)

```
[Browser]
    ↓ (localStorage only, no server)
[Netlify static site]
    ↑
[Netlify edge]

[cron f461006984b2]
    ↓ (sends Feishu webhook)
[send_daily.py] → [Feishu webhook]

[Flask local dev server (port 5200)]
    ↑ (localhost only)
[Mac user (weilai)]
```

### Known security boundaries

| Boundary | Status | Notes |
|----------|--------|-------|
| Public Netlify site | ✅ No PII | All data in client localStorage |
| Flask port 5200 | ✅ Localhost only | Not exposed to internet |
| Feishu webhook | ⚠️ In commit history | Stored in `~/.openclaw/workspace/projects/english-打卡-DEPRECATED-PWA/publish.sh` |
| progress.json | ⚠️ Git tracked | Contains user-private learning progress — not exposed publicly |

### Security best practices applied

1. **No backend authentication needed** — all user data in browser localStorage
2. **No database** — no SQL injection surface
3. **Webhook URL in `.env`-style files only** — but currently in `publish.sh` (TODO: move to env var)
4. **HTTPS by default** — Netlify enforces TLS for public site
5. **No third-party JS** — all client JS bundled, no external CDN

### Known limitations

1. **Feishu webhook URL in git history** — anyone with repo access can send messages to the configured group. _Mitigation: PAT is scoped to one chat, treat as semi-public._
2. **Flask session uses Flask 3.1 default Samesite=Lax** — cookies not sent cross-site. ✅ OK
3. **No rate limiting on Flask dev server** — fine for localhost, _don't expose to internet_
4. **`send_daily.py` reads `FEISHU_WEBHOOK` from env** — but if env is empty, raises ValueError (not silently no-op) ✅

### Hardening roadmap (future)

- [ ] Move Netlify PAT to env var (not in `publish.sh`)
- [ ] Add `SECURITY.md` badge to README
- [ ] Add GitHub Dependabot for Python deps
- [ ] Add `pre-commit` hook for secrets scanning (`gitleaks` or `detect-secrets`)
- [ ] Document `data/progress.json` privacy (currently git tracked, contains user progress)

---

## Past Security Advisories

_None yet — first release is v0.12.0._

---

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

- _(none yet)_

---

## Contact

- **Maintainer**: [@weilai](https://github.com/weilai)
- **Email**: 5-529@163.com
- **Project home**: `~/Projects/english-checkin/`
- **Public site**: <https://weilai-zte.github.io/english-checkin>
