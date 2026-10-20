# PaceMate Web 2.0 UI test dashboard

A static page that shows the latest Web 2.0 UI test run in an Allure-style report. CI writes the results into `data/`, Vercel serves the page. There is no build step: edit a file, push, and Vercel deploys in about 30 seconds.

## What lives where

| Path | What it is | Who changes it |
|---|---|---|
| `config.js` | All settings: threshold, rerun command, greeting, stale warning, which test types to hide | You, most of the time |
| `index.html` | Page layout and section headings | Rarely |
| `assets/styles.css` | Look and feel. Colors are the two token blocks at the top (dark, then light) | Rarely |
| `assets/app.js` | All logic. A section index at the top says where everything is | Rarely |
| `data/` | `results.json`, `runs.json`, `coverage-results.json` | CI only. Do not edit by hand |
| `samples/` | Copies of real data (runs R-143 to R-152) for previews and tests | When the data format changes |
| `scripts/serve.mjs` | Local preview server, no install needed | Never |
| `scripts/check-data.mjs` | Checks `data/` has what the page needs | Never |
| `tests/` | Playwright checks, run in GitHub Actions on every change | When you add a feature |

## Common changes

| I want to... | Do this |
|---|---|
| Change the 80% release threshold | `config.js`, `releaseThreshold` |
| Change what Rerun copies | `config.js`, `rerunCommand` |
| Change "Good afternoon, team" | `config.js`, `greetingName` |
| Warn sooner or later about old data | `config.js`, `staleAfterHours` |
| Show or hide a test type | `config.js`, `excludeTypes` (matches `type` in `results.json`) |
| Change the suite name shown in Environment | `config.js`, `suiteLabel` (empty shows what CI sends) |
| List more suites before "All suites" | `config.js`, `maxSuitesListed` |
| Change a color | `assets/styles.css`, top of the file. Change the same token in both the dark and light blocks |
| Change a heading or description | `index.html` (search for the text) |
| Roll back a bad deploy | Vercel, Deployments, pick the last good one, Instant Rollback. Or `git revert` the commit |

## Preview a change on your machine

From the repo folder (works in PowerShell, cmd and bash, needs Node 18 or newer):

```
node scripts/serve.mjs
```

Then open:

- `http://localhost:4173/?data=samples` uses the sample data, so it always has something to show
- `http://localhost:4173/` uses whatever is in `data/`

The page says "Showing sample data" when it is using the samples.

## Run the tests

```
cd tests
npm ci
npx playwright install chromium
npm test
```

There are 28 checks: numbers on every page, every sidebar link, rerun and bug-report copy, data problems (missing file, old run, config settings), WCAG A and AA accessibility in dark and light, and phone width. They run against `samples/`, so they give the same result every time.

`npm run report` opens the HTML report after a failed run.

## How a change ships

1. Make the change on a branch and preview it.
2. Open a pull request. **Dashboard tests** runs the Playwright checks.
3. Merge when it is green. Vercel deploys `main`.

You no longer need `old1.index.html`, `old2.index.html` and so on. Git keeps every version, and Vercel can roll back to any earlier deploy. To clear them out:

```
git rm old*.index.html
git commit -m "Remove old backups, git history has them"
```

Before a big change, tag the current version so it is easy to find: `git tag before-<what-you-are-changing>` then `git push --tags`.

## Data the page needs

`results.json` (required)

| Field | Required | Used for |
|---|---|---|
| `runId` | Yes | Run name everywhere, for example `R-152` |
| `generatedAt` | Yes | "Finished 2 hours ago", stale warning |
| `tests[]` | Yes | Everything. Each test needs `name` and `status` (`passed`, `failed`, `flaky`, `broken`, `skipped`) |
| `tests[].comp` | Should have | Suite name. Missing means "Uncategorized" |
| `tests[].type` | Should have | `UI` or `API`. Types in `excludeTypes` are hidden |
| `tests[].dur` | Should have | Duration, for example `12.4s` or `1m 5s` |
| `tests[].err`, `fullErr`, `failedStep` | For failures | Error text, categories, bug reports |
| `summary.duration` | Should have | Run time |
| `branch`, `env`, `suite`, `runUrl` | Optional | Environment panel and GitHub links |
| `comp[]` with `hData[]` and `hRuns[]` | Optional | Suite health over the last 5 runs |
| `flaky[]` | Optional | Flake rate over the last 10 runs |

`runs.json` (optional, one entry per run, oldest first)

| Field | Used for |
|---|---|
| `runId` or `runNum` | Run name |
| `rate`, `total`, `passed`, `failed`, `flaky` | History, used only when there is no UI breakdown |
| `layers.ui` | UI-only numbers for trends, run-to-run changes and the streak. Keep this in the extractor |
| `duration`, `generatedAt`, `branch`, `runUrl` | History table and run details |
| `compRates` | Suites shown when you open a past run |

`coverage-results.json` (optional) feeds the Requirements page: `summary` and `requirements[]`.

## Checking the data

```
node scripts/check-data.mjs data
```

It prints OK, WARN and ERROR lines in plain English. ERROR means the page would break or show nothing. Two workflows run it for you:

- **Data check** runs every time CI pushes new results.
- The same workflow runs **every weekday at about 10am Eastern** with `--fail-if-stale`. If no results arrived in the last 36 hours, it fails and GitHub emails you. This would have flagged the gap after R-152 on June 23.

If you change the extractor, run the check on its output before pushing.

## When something looks wrong

| You see | Likely cause | Fix |
|---|---|---|
| "No run data found" | `data/results.json` is missing or not valid JSON | Check the latest framework workflow run pushed to this repo. Run `check-data` |
| "The last run finished N days ago" | The scheduled workflow stopped pushing results | Check the framework repo's Actions tab and its push step |
| Numbers look too high | API tests counted as UI | Make sure the extractor sets `type: "API"` on API tests |
| A trend or change is missing | Older runs have no `layers.ui` | Keep `layers.ui` in the extractor. New runs fill in as they arrive |
| Rerun finds no scenario | The test name in `results.json` differs from the feature file | Compare the two; the command matches the name after any `PMW-x.y -` prefix |
| Old version still showing after a deploy | Browser cache | Hard refresh with Ctrl+F5 |

## Adding a new sidebar page

1. `index.html`: add a nav button `<button class="nav-item" type="button" data-view="xx">` inside `<nav id="nav">`, and a section `<div class="view" id="view-xx" hidden>...</div>` inside `<main>`.
2. `assets/app.js`: add `xx: 'your-hash'` to `HASH` in the views section, write a `renderXx()` function, and call it in `load()` next to the others.
3. `tests/dashboard.spec.ts`: add `['xx', '#your-hash']` to the Navigation list.

## When the data format changes

1. Copy a fresh `data/*.json` into `samples/`.
2. Run `npm test` in `tests/`. Update the expected numbers it reports (pass rate, counts, run names) in `tests/dashboard.spec.ts`.
3. Run `node scripts/check-data.mjs samples` to confirm the new format reads cleanly.
