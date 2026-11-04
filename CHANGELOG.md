# Changelog

## v1.0.0: 2026-11-04

The first public release. A portfolio project with synthetic data only, which has had no independent security review.

**Live demo:** https://iknowserviceai.onrender.com. It runs the built-in mock agent, on free hosting.

### Service desk

- Requesters submit requests in free text, follow their status and rate suggestions.
- Support staff work a queue, and review AI drafts beside the reply they will publish.
- Admins manage a versioned knowledge base, and read an append-only audit log.
- The interface has light and dark themes, and works at 375 px and with the keyboard alone.

### Bounded AI workflow

- The model only proposes text. It has no tools, and application code validates and writes everything.
- Sensitive values are redacted before retrieval, prompting and storage.
- Retrieval uses PostgreSQL full-text search over published articles.
- A citation must be in the retrieved set and currently published.
- A deterministic policy gate scans input, output and sources. Flags only accumulate, and any flag holds the reply for a person.
- Staff cannot publish a reply that asks for credentials.
- Two providers sit behind one adapter: a built-in mock, and Gemini.

### Security

- Short-lived access tokens in memory, and rotating refresh tokens in an `HttpOnly` cookie, with reuse detection.
- A least-privilege database role, and audit history protected by both grants and triggers.
- A strict Content-Security-Policy and security headers in production.
- Rate limits on sign-in, refresh and analysis.
- Public demo safeguards: a daily self-reset, volume caps and a banner.

### Quality

- In CI: 876 backend tests, 242 frontend tests, and browser suites of 34 tests on the development stack and 46 on the production image.
- 172 axe checks in both themes, at 1440 and 375 px, with no findings. Chromium only, and no real screen reader was tried.
- A 43-case evaluation through the real pipeline. Its 100% sensitive hold rate is on a fixture used to tune the patterns, so it says little about new text. The live provider sample is only 10 cases, plus 2 through the running app.
- A paced browser subset, and HTTP checks, against the live site.

### Fixed before release

- `TRUSTED_PROXY_HOPS` was wrong on Render, which left the sign-in limiter unreliable. It is now set from the measured proxy chain (ADR-061).

### Known limitations

- Pattern-based policy scanning can be evaded by rephrasing or other languages, and produces false holds.
- Replies that pass every check are shown unreviewed, labeled as AI, and may still be wrong.
- Reply quality has not been scored, and there is no held-out evaluation set.
- Rate limits live in one process, so the service must run as one instance.

The full list is in [the status document](docs/IMPLEMENTATION_STATUS.md).
