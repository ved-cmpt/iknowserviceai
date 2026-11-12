# IknowServiceAI v1.1.0: a new look, and a public website

**An IT service desk where AI drafts the answer and people stay in charge.** v1.1 gives the project its own brand, a public website that explains it with replays of real runs, and a redesigned app. The AI workflow, its safety gates, the API and the data model are unchanged.

**[Open the website](https://iknowserviceai.onrender.com)**, or go straight to **[the app](https://iknowserviceai.onrender.com/app/login)**. The first load after idle may take 30 to 60 seconds, on free hosting. The demo accounts' password is intentionally public. All data is synthetic, shared and reset daily, so please don't enter anything real.

## What's new

- **A public website at `/`.** An animated hero replays two recorded runs through the pipeline, stage by stage: redaction, retrieval, triage and the policy gate. Four interactive demos show an ordinary request, a sensitive one held for a person, a prompt injection, and a staff reply refused for asking for a password. The website makes no API calls.
- **Every number has a source.** The demos and evaluation numbers come from a snapshot that a script records from real mock-mode runs of the real pipeline, and CI checks it against a fresh run. Each statistic names the results file it comes from, with its caveats beside it.
- **A redesigned app under `/app`.** A collapsible sidebar, a command palette on Ctrl+K or Cmd+K, keyboard shortcuts, an account menu, a first-visit tour, and a word diff of the AI draft against the reply staff will publish. Old links such as `/login` and `/support` still work.
- **A new brand and a dark-first design system.** An original mark, a reply card with a check, and self-hosted Inter and JetBrains Mono.

## Quality

- 906 backend and 300 frontend tests. Browser suites on the development stack and the production image, with axe in both themes at 375, 768, 1280 and 1440 px, and no findings.
- Lighthouse for the website on the local production image: 100 for performance, accessibility, best practices and SEO, on mobile and desktop. The live site's numbers are in the Run 07 report.
- Measuring found two real problems, now fixed: animation dimmed text below contrast, and the hero shifted when its data arrived.

## Read this before relying on it

Nothing about the limits changed:

- It has had **no independent security review.**
- **Pattern-based scanning can be evaded.** The 100% sensitive hold rate is on a fixture used to tune the patterns, after a first run of 86.4%.
- **The public demo runs the built-in mock agent,** so it shows the workflow, not model quality. The live provider sample is 10 cases.
- **Browser checks ran in Chromium only,** and no real screen reader has been tried.

## Learn more

[README](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/README.md) · [Brand](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/docs/BRAND.md) · [Security](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/docs/SECURITY.md) · [Evaluation](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/docs/EVALUATION.md) · [Changelog](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/CHANGELOG.md) · [Run 07 report](https://github.com/ved-cmpt/iknowserviceai/blob/v1.1.0/docs/RUN_REPORTS/RUN_07.md)
