# Arablyzer GitHub Action

Scans a page with Arablyzer (Arabic rendering in three browsers, RTL, SEO, accessibility, security, speed) from a
workflow: a score, a job summary with the worst problems, and a SARIF file for GitHub code scanning. It calls the
[public API](https://arablyzer.com/developers) with your key; a scan comes out of your account's own quota, and the same
page scanned again within ten minutes returns the earlier scan and uses none.

## Use it

1. Sign in, open **Account → API keys**, make a key (`arb_…`), and keep it as a repository secret named
   `ARABLYZER_API_KEY`.
2. Add a workflow:

```yaml
name: Arablyzer
on:
  schedule: [{ cron: '0 6 * * 1' }]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write # to upload SARIF to code scanning

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - id: arablyzer
        uses: Shahoom/arablyzer/integrations/github-action@main # pin a tag or a commit once released
        with:
          url: https://example.com/
          api_key: ${{ secrets.ARABLYZER_API_KEY }}
          fail_on: critical # critical, serious or none (the default)
          lang: ar # the job summary and the alerts, in Arabic (ar) or English (en)
      - uses: github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938 # v4.37.9
        if: always() && steps.arablyzer.outputs.sarif_dir != ''
        with:
          sarif_file: ${{ steps.arablyzer.outputs.sarif_dir }}
```

`example-arablyzer.yml.disabled` in `.github/workflows/` of this repository is the same, ready to rename.

## Inputs

| Input             | Default                 | What it does                                                                                            |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `url`             |                         | The page to scan (http or https).                                                                       |
| `urls`            |                         | More pages, one per line or comma separated; with `url`, at most 10 in all.                             |
| `api_key`         | (required)              | An API key. Keep it in a secret; the action masks it in the log.                                        |
| `api_url`         | `https://arablyzer.com` | Where Arablyzer is. Change it only if you run your own.                                                 |
| `fail_on`         | `none`                  | Fail the step when a page has findings of this severity or worse: `critical`, `serious` or `none`.      |
| `wait`            | `true`                  | Wait for the scan, then write the summary and SARIF. With `false` the scan is started and not awaited.  |
| `lang`            | `en`                    | `ar` or `en`: the language of the summary and of the SARIF messages and rule titles.                    |
| `sarif_dir`       | `arablyzer-sarif`       | A folder in the workspace; one `.sarif` file per page is written to it.                                 |
| `timeout_seconds` | `300`                   | How long to wait for each scan (30 to 1800). The action asks politely: every 3 to 10 seconds.           |
| `max_issues`      | `10`                    | How many problems the summary lists for each page (1 to 50).                                            |

## Outputs

`score` (the lowest overall score among the pages), `scores` (JSON, page to score), `findings` (JSON, counts by
severity over all pages), `report_urls` (JSON array of the report pages), `sarif_dir` (empty when none was written),
`result` (`pass`, `fail`, `error` or `started`).

## SARIF

One file per page, SARIF 2.1.0, one run each with its own `automationDetails` category (`arablyzer/<host>/<path>/`), so
code scanning tracks each page's alerts apart.

- `ruleId` is the Arablyzer rule; `helpUri` is the rule's page on the site (in the language you chose), with why it
  matters and how to fix it.
- `level`: critical and serious are `error`, moderate `warning`, minor and info `note`.
- A finding's place is the page's address, with the CSS selector as its logical location (a page has no file and
  line). A stable fingerprint lets GitHub tell the same finding on the next run.

Code scanning is free for public repositories; a private one needs GitHub Code Security.

## Exit code

The step fails when: a page could not be scanned (a refused key, a limit, a blocked address, a scan that failed or
did not finish in `timeout_seconds`), or a page has findings at `fail_on` or worse. Every page is still tried, and the
summary and outputs are written either way.

## Developing

The action runs the committed `dist/index.mjs`, so a workflow installs nothing. After a change in `src/` (or in
`integrations/core`, `packages/i18n`), run `pnpm action:build` and commit `dist/`; CI rebuilds it and fails if it
differs from the commit.

Publishing to the GitHub Marketplace needs `action.yml` at the root of a public repository: copy this folder's
`action.yml`, `dist/` and `README.md` to a repository of their own (for example `arablyzer-action`), tag a release and
choose the Marketplace option on it.
