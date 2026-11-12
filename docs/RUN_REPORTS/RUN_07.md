# Autopilot run 07 report

**Result: `v1.1.0`, with a new brand, a public website at `/` and a redesigned app under `/app`, merged through three pull requests, deployed and verified on the live site.** The AI workflow, its safety gates, the API contract and the data model did not change.

**Things you may want to know first:**

- **Measuring found two real problems that tests had missed,** and both are fixed. With motion allowed, the website dimmed text below contrast while animating, and the hero shifted when its data arrived (CLS 0.022 on desktop). Every browser test runs with reduced motion, so axe never saw the first. Lighthouse did. A new test now runs axe with motion allowed (ADR-067).
- **Sign out moved into the account menu** in the top bar. It takes two clicks now.
- **Dark is now the default theme,** even when the system is light, as you asked. A choice is remembered.
- **I reset the live demo data once in the middle of the run,** with the runbook's procedure, because my first live screenshot run had left requests behind that made the second one ambiguous. A reset ends everyone's sessions. It is reset again after the merge (section 13).
- **Two local browser tests failed once because of me,** not the code: I ran the live screenshot capture while the local suites were running, and both share `e2e/test-results`, so one cleared it under the other. Both tests passed on rerun. The handoff now warns about it.

## 1. State found at start

`main` at `fe36b08`, clean, `v1.0.0` tagged and live. The repository had become public. Seven Dependabot pull requests were open. Another project's containers were running in Docker, which I left alone.

**Baseline, all passing:** backend 876 passed, 1 skipped. Frontend 242 passed, lint and build clean. Dev browser suite 34 passed, 13 skipped by design. Production image 46 passed, 1 skipped, with 94 axe checks and no findings. My first production baseline failed to build because I changed `package.json` while it ran, so I reran it from a clean worktree of `main`.

## 2. What was built

| Checkpoint | What | Decision |
|---|---|---|
| 29 Brand and design system | Original mark (a reply card with a check: "AI drafts, people approve"), small mark, outlined wordmark, dark and light lockups, app and maskable icons, favicon SVG and ICO (16, 32, 48), 180, 192 and 512 px PNGs, a 1200 x 630 Open Graph image, all from `scripts/brand/build.mjs`. `docs/BRAND.md`. Dark-first semantic tokens, a tuned light theme, motion tokens, self-hosted Inter and JetBrains Mono, Lucide icons | ADR-062 |
| 30 Routes | Website at `/`, app under `/app` as a second page of one Vite build, client redirects from every old path with query and fragment, `robots.txt`, `sitemap.xml`, social tags, gzip for text at the origin | ADR-063 |
| 31 Data snapshot | `scripts/landing_snapshot.py`: four scenarios through the real pipeline on a fresh seed in a rolled-back transaction, plus evaluation numbers from `backend/eval/results`. `--check` in CI and in pytest | ADR-064 |
| 32 Website | All 12 sections, a pausable hero replay, four ARIA-tab demos, deep links that sign in as the right demo person | ADR-065 |
| 33 App shell and screens | Collapsible role-aware sidebar, breadcrumbs, account menu, command palette, shortcuts with a `?` overlay, `j`/`k` in the queue, toasts, a non-modal first-visit tour, a new sign-in page, a word diff of the AI draft against the reply | ADR-066 |
| 34 Tests and performance | Every screen at 768 and 1280 px too, a motion test, website checks in the production suite, Lighthouse pinned and scripted, the design review | ADR-067 |
| 35 Release | README with a website hero and live screenshots, demo video, changelog, release notes, status, handoff, this report | |

**Dependabot** is quieter: grouped per ecosystem, monthly, at most two open, majors still ignored. After the change it closed the seven old pull requests by itself and opened grouped ones (#14, #15, #16). #7 is still open.

## 3. Honesty checks

| Rule | How it holds |
|---|---|
| Every number traceable | The website's numbers come from `frontend/public/data/landing-snapshot.json`, generated from real runs and results files, and checked against a fresh run in CI. Each statistic names its file on the page |
| Nothing claimed that v1 does not do | Each pipeline step links to the file that enforces it. The comparison describes v1 as built, and hedges the "typical chatbot" column |
| No invented social proof | No logos, testimonials, user counts, prices, awards or plans |
| Caveats beside numbers | The tuned fixture, the 86.4% first run, the 10-case live sample and "mock measures the pipeline" sit next to the numbers |
| Staff review demo | Replays the server's two recorded responses, a 422 `UNSAFE_REPLY` and an approval, rather than imitating the check in the browser |

## 4. Verification

| Command | Result | Exit |
|---|---|---|
| `pytest -q`, ruff, format | 906 passed, 1 skipped. Clean | 0 |
| `npm run lint`, `npx vitest run`, `npm run build` | 300 passed. Clean | 0 |
| `npm --prefix e2e run e2e` | 66 passed, 1 interrupted by my parallel run, 15 skipped by design. The interrupted test passed on rerun | 1, then 0 |
| `npm --prefix e2e run e2e:prod` | 80 passed, 1 interrupted the same way, 1 skipped. Passed on rerun | 1, then 0 |
| New viewport and motion spec, dev | 7 passed | 0 |
| `python scripts/landing_snapshot.py --check` | Matches a fresh run | 0 |
| Pre-push scan, before every push | gitleaks history exit 0; tree: only the 4 reviewed fake values; real secrets 0 in history and files | 0 |
| CI, PR 1 and PR 2 (subset), and `main` after each merge (full) | All jobs succeeded | |
| `node e2e/verify-live.mjs`, live | 54 of 54 | 0 |
| `node e2e/run-live.mjs desktop --grep @smoke`, live | 10 passed, 154 requests | 0 |
| `node e2e/run-live.mjs screenshots`, live | 7 passed, after a fix and a data reset | 0 |
| `npm --prefix e2e run demo:record` | 103 s video, 1.3 MB, preview 3.4 MB | 0 |

**Live provider calls: 0.**

## 5. Accessibility

axe with `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`, failing on any finding, in both themes:

- **Widths:** 375 and 1440 px for every journey, and 768 and 1280 px for every screen, with no horizontal scroll at any of them.
- **Also covered:** the four demo tabs, the command palette, the shortcuts list, the first-visit tour, and the website with motion allowed, mid-animation.
- **190 checks on the production image, 0 findings.**

**Fixed during the run:** axe's label-in-name rule failed on the account button and the sidebar search, whose labels did not contain their visible text. The account button's name is now built from its visible text. Contrast while animating, as above.

**Not done:** a real screen reader, and browsers other than Chromium.

## 6. Lighthouse

Lighthouse 13.6.0, with the Playwright image's Chromium, for `/`.

| Where | Preset | Performance | Accessibility | Best practices | SEO | CLS | Transfer |
|---|---|---|---|---|---|---|---|
| Local production image, first, median of 3 | Mobile | 98 | **97** | 100 | 100 | 0 | 186 KiB |
| Local, first | Desktop | 100 | **97** | 100 | 100 | **0.022** | 186 KiB |
| Local, after the fixes, median of 3 | Mobile | **100** | **100** | **100** | **100** | 0 | 186 KiB |
| Local, after the fixes | Desktop | **100** | **100** | **100** | **100** | 0 | 186 KiB |
| Live, before PR 3 deployed, 1 run | Mobile | 100 | 97 | 100 | 100 | 0 | 181 KiB |
| Live, before PR 3 deployed, 1 run | Desktop | 100 | 97 | 100 | 100 | 0.022 | 181 KiB |

The live runs measured PR 2's code, which did not yet have the fixes. The live run after PR 3 deployed is in section 13 and in the tag's annotation. Targets were mobile performance at least 90, desktop at least 98, and 100 for the rest. Local scores on a fast machine say little about a phone on a slow network.

**Budgets:** the website's JavaScript is about 86 KB compressed, under 120 KB. The page with fonts and data is 186 KiB, under 300 KiB.

## 7. Test counts

| Suite | Start | End |
|---|---|---|
| Backend | 876 passed, 1 skipped | 906 passed, 1 skipped |
| Frontend | 242 | 300 |
| Dev browser | 34 passed, 13 skipped | 67 passed, 15 skipped |
| Production browser | 46 passed, 1 skipped | 81 passed, 1 skipped |
| axe, production image | 94 | 190 |

## 8. Self-review findings

I captured 16 pages in both themes at 1440 and 375 px, 64 pictures, and reviewed them as contact sheets, as a demanding product designer would.

| Finding | Fix |
|---|---|
| Website: the comparison table scrolled sideways on phones, and the scroll area had no keyboard access | Each row becomes a card under 720 px |
| Website: the hero headline wrapped to five lines on desktop | A wider copy column and a smaller maximum size |
| Website: the final call to action used a generic icon | The brand mark |
| Website: pipeline steps stayed dim in reduced motion, and dimmed text failed contrast while animating | Lit from the start with reduced motion, and dimming moved off the text |
| App on phones: the top bar showed only "Menu", with no brand | The mark beside the Menu button |
| Shell: the new search buttons shared a name with the knowledge page's Search button | The top-bar button is "Open search", and tests match "Menu" exactly, because "Account menu" contains it |
| Review workspace: the draft and the reply were hard to compare | A word diff, with counts in words |
| Live screenshot of the website demos: the section heading sits under the sticky navigation | Left as is: it is a scroll position in the picture, not a layout fault |

Every page had no horizontal overflow and no script errors.

## 9. Unverified

- **The limiter from a second network,** carried over from Run 06.
- **Real screen readers and non-Chromium browsers.**
- **The live browser subset on a phone width.** Only the desktop smoke subset ran live, to stay gentle with the shared demo.
- **The live screenshots predate PR 3's polish,** so the phone pictures do not show the new top-bar mark. Nothing else visible changed.

## 10. Deviations and decisions

| Item | What and why |
|---|---|
| Two HTML entries rather than one page | So each page loads only its own code, with no extra request before rendering (ADR-063) |
| Old paths redirect on the client, from the app page | As asked. The server sends old paths to the app page, which rewrites the address before the router starts |
| Website data fetched at run time | A static, same-origin file, not an API call, and linkable as raw data |
| `?as=` and `?next=` on the sign-in page | Needed for "See it in the app" with a persona hint. `next` must be a path inside the app |
| Sign out in the account menu | A deliberate structure change. Tests changed accordingly, with no assertion weakened |
| The "no token in storage" test | Now allows exactly three display-preference keys, and still rejects anything token-like |
| A mid-run data reset | Needed to make the screenshot capture unambiguous. Ran the documented procedure, with a temporary env file that was deleted |
| Lighthouse added to `e2e/` | Pinned, Apache-2.0, run with the existing Chromium (ADR-067) |
| Extra commit in PR 1 | Dependabot's change got its own commit |

ADRs added: 062 to 067.

## 11. Bugs found and fixed

1. **Text contrast while animating** on the website, found by Lighthouse, missed by axe under reduced motion.
2. **Layout shift of 0.022** on desktop when the hero's data arrived.
3. **Two label-in-name failures,** found by axe on the new shell.
4. **A heredoc in my shell ate backslashes** in one helper's regular expression, so `/[\s]/` became `/[s]/`, which refused any path with an "s". A unit test caught it before it shipped.

## 12. Commits

```text
PR 1, #13 (closes #12): Brand, design system and routes
  f3f120b Add the IknowServiceAI brand and a dark-first design system
  4f4d23c Make Dependabot quieter: grouped, monthly, two open at most
  24fa3f4 Move the app under /app and give / to a public website
  b800611 Add the website's data snapshot from real pipeline runs
  e94575e Merge pull request #13

PR 2, #18 (closes #17): Public website and redesigned app
  36d4e67 Build the public website with animated hero and interactive demos
  f0ce6a6 Add the new app shell and redesign every screen
  539b05d Merge pull request #18

PR 3 (closes #19): Tests, performance and v1.1.0
  06a8cc1 Test the new UI and website
  6e25ae0 Polish after the design review
  5147905 Make the website fast
  Release v1.1.0: the Run 07 report, README, screenshots, changelog and status
```

Each pull request was merged with a merge commit after its checks passed, and its branch deleted.

## 13. After the merge

These steps follow the merge of PR 3, so they cannot be in this file. Their results are in the annotation of the tag `v1.1.0` (`git show v1.1.0`):

1. Wait for CI on `main` and for Render's redeploy.
2. Lighthouse once per preset on the live site, which should now show the fixes.
3. A quick live check of the website and the redirects.
4. Reset the live demo data.
5. Tag `v1.1.0` on the merged `main`, and push the tag.

## 14. Owner actions

1. **Create the GitHub Release** from the tag `v1.1.0`, pasting `docs/RELEASE_NOTES_v1.1.0.md`.
2. **Dependabot:** review the grouped pull requests #14, #15 and #16, and close #7 if a grouped one replaces it.
3. **Optional:** try the site from a phone on mobile data, which also covers the limiter check carried over from Run 06.

## 15. How to try it

Open https://iknowserviceai.onrender.com. Watch the hero, try the demo tabs, then choose **Try the live demo** and pick a person. In the app, press **Ctrl K** or **?**. If it has been idle, the first load takes 30 to 60 seconds.
