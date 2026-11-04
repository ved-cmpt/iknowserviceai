# IknowServiceAI v1.0.0: first public release

**An IT service desk where AI drafts the answer and people stay in charge.** A bounded AI workflow triages requests and suggests fixes from a knowledge base, while deterministic code decides what a person must review first.

**[Open the live demo](https://iknowserviceai.onrender.com).** The first load after idle may take about a minute, on free hosting. The password for the demo accounts is intentionally public, and is shown on the sign-in page. All data is synthetic, shared and reset daily, so please don't enter anything real.

The public demo runs the built-in mock agent, so it shows the workflow and its safety gates, not model quality. The real provider's results are in [the evaluation](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/docs/EVALUATION.md).

## What's in it

- **For requesters:** describe a problem, and get suggested steps, labeled as AI, with links to the articles they came from.
- **For sensitive requests:** a suspected compromise or a request for admin rights is held. The requester sees no AI text until a person approves a reply.
- **For support staff:** a queue, the reasons a request was held, and the draft beside the reply to publish. A reply that asks for a password is refused.
- **For admins:** a versioned knowledge base, and an append-only audit log.

## Engineering highlights

- The model has no tools and only proposes text. Application code validates and writes everything.
- A deterministic policy gate, where flags only accumulate, so a model cannot clear its own review.
- Citations must be in the retrieved set and currently published.
- Redaction before retrieval, prompting and storage.
- Rotating refresh tokens with reuse detection, and a least-privilege database role.
- 876 backend tests, 242 frontend tests, browser suites with axe checks in both themes, and a secret scan of the full history in CI.
- Verified on the live site: headers, cookies, sessions, rate limits and persistence after a redeploy. That testing found a real bug in the proxy settings, which is fixed (ADR-061).

## Read this before relying on it

- It has had **no independent security review.**
- **Pattern-based scanning can be evaded** by rephrasing or other languages. Replies that pass every check are shown unreviewed, labeled as AI, and may still be wrong.
- **The 100% sensitive hold rate is on a fixture used to tune the patterns,** after a first run of 86.4%. It says little about new text.
- **The live provider sample is small:** 10 cases through the orchestrator and 2 through the running app. Reply quality has not been scored.
- **Browser checks ran in Chromium only,** and no real screen reader has been tried.

## Learn more

[README](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/README.md) · [Architecture](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/docs/ARCHITECTURE.md) · [Security](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/docs/SECURITY.md) · [Evaluation](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/docs/EVALUATION.md) · [Changelog](https://github.com/ved-cmpt/iknowserviceai/blob/v1.0.0/CHANGELOG.md)
