# Google signals

Safe Browsing, Search Console, and (sections 3 to 6) the platform check, the Knowledge Graph, Open PageRank and the HTTP Archive benchmark. Each is optional and off without its key; none stores anything of Google's or anyone's. The key is sent in a header, never in a URL, for all of them (confirmed live for Safe Browsing).

## 1. Safe Browsing (rule `safe-browsing-flagged`)

- **What:** each scan asks the Safe Browsing Lookup API v4 (`threatMatches:find`) about the page's URL and its origin, for `MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE` and `POTENTIALLY_HARMFUL_APPLICATION`, platform `ANY_PLATFORM`. The rule (category `trust`, severity `critical`) has one finding for each type Google lists; it passes when Google lists nothing.
- **Key:** `ARABLYZER_SAFE_BROWSING_KEY`, else `ARABLYZER_CRUX_KEY` (one Google key may allow both APIs). The CLI reads `ARABLYZER_SAFE_BROWSING_KEY`, else `ARABLYZER_CRUX_API_KEY`. The key goes in the `X-Goog-Api-Key` header, never in a URL, as for CrUX.
- **When it does not run:** no key (notice `safe-browsing-no-key`), a private or local page (`safe-browsing-private`): the rule does not apply. A Google error or a refused key (`safe-browsing-failed`, `safe-browsing-refused`) makes the rule an `error` and the scan partial, never a pass or a failure. Nothing is cached between scans; the call has a 10 s limit and goes through the egress rules (`safeFetch`).
- **Privacy:** the scanned URL and its origin go to Google, with the key; nothing else of the page.
- **Pieces:** `packages/collectors/src/safe-browsing.ts` (reads the answer), `packages/engine/src/safe-browsing.ts` (asks), the rule in `packages/rules/src/rules/safe-browsing-flagged/` (copy in Arabic, `reviewed: false`, and English), a stand-in API in `fixtures/src/safe-browsing.ts`, and `safeBrowsing` in a fixture site's `site.json`.
- **Golden reports:** the new rule and its notices change them. They come from the scanner image in CI (`ARABLYZER_GOLDEN_OUT`); `fixtures/golden/sites/01-clean-store` has a clean answer and `18-crux-slow` a flagged one. Commit the reports CI keeps; until then `test/golden-coverage.test.ts` fails, as for any new rule.

## 2. Search Console (connect, read, show; store nothing)

There are no accounts, so the connection belongs to one visit to one report.

```
report page ──► GET /api/gsc/start?report=<id>&lang=ar|en
                  - rate-limited like the scan routes (the attempts' window, by visitor)
                  - PKCE verifier kept server-side (Valkey/memory, 10 min), keyed by a random nonce
                  - HttpOnly, SameSite=Lax, Secure cookie arablyzer_gsc (Path /api/gsc, 10 min):
                    { nonce, report, expiry } signed with HMAC-SHA-256 (key derived from ARABLYZER_LIMIT_SECRET)
                  - 302 to accounts.google.com: response_type=code, scope=webmasters.readonly, state=nonce,
                    code_challenge (S256), access_type=online, prompt=select_account
Google ──► GET /api/gsc/callback?code&state
                  - cookie signature and expiry; state == the cookie's nonce; verifier read ONCE (a replay finds none)
                  - exchanges the code (client secret and verifier in the body, exact redirect URI)
                  - sites.list, the property for the report's URL (sc-domain: first, the most specific; else the
                    longest URL prefix on the same scheme and host; unverified-user entries are skipped)
                  - Search Analytics, 28 days ending two days ago: totals, top 10 queries, top 10 pages, top 5 countries
                  - URL Inspection of the report's URL
                  - the token is revoked at Google and dropped; the result is kept 5 min under a random 256-bit id
                  - 302 to <ARABLYZER_SITE>[/en]/r/<report>?gsc=<result id | denied | error>
report page ──► removes ?gsc= from the address at once, GET /api/gsc/results/<id> (read once, then gone)
```

- **Feature off:** without `ARABLYZER_GSC_CLIENT_ID` and `ARABLYZER_GSC_CLIENT_SECRET` (or `ARABLYZER_SITE`, or the one-time store) `GET /api/gsc/status` says `{ "enabled": false }`, the other routes are 404, and the report page draws nothing.
- **Env:** `ARABLYZER_GSC_CLIENT_ID`, `ARABLYZER_GSC_CLIENT_SECRET`; the redirect URI is `<ARABLYZER_SITE>/api/gsc/callback`, so the site's origin is `ARABLYZER_SITE`, which production already requires. Set both or neither (production refuses half).
- **Privacy:** read-only scope; an online token (no refresh token), used within the one request and revoked. No Search Console data and no token is written to PostgreSQL, a log or a file. The only trace is the result in Valkey for at most five minutes, read once (Valkey keeps nothing across a restart: `save ""`, `appendonly no`). Errors are logged by message alone.
- **Security:** `state` and the signed cookie bind the callback to the browser that started it; PKCE; the exact redirect URI; report ids validated by their pattern; the only redirects go to Google's authorization endpoint and to the site's own origin; Google's calls go through `safeFetch` (egress policy, 10 s, 512 KB); the API's `no-store`, `no-referrer` and `noindex` headers apply.
- **Pieces:** `apps/api/src/gsc/` (`oauth.ts`, `google.ts`, `shape.ts`, `routes.ts`), `Handoff` in `packages/store` (memory and Valkey), the contract types in `packages/api-contract/src/codes.ts`, `safeFetch`'s new `form` option (OAuth's token endpoint takes a form), the card in `apps/web/src/islands/report/Gsc.tsx` (strings in `packages/i18n/src/report.ts`, `reviewed: false`).

## What the owner sets up

1. **Google Cloud project:** enable the **Google Search Console API** (this also serves URL Inspection) and the **Safe Browsing API**.
2. **API key** (Safe Browsing, and CrUX if the same key is used): restrict it to those APIs; set `ARABLYZER_SAFE_BROWSING_KEY` (or leave it empty to use `ARABLYZER_CRUX_KEY`).
3. **OAuth consent screen:** external, app name and support email, the scope `.../auth/webmasters.readonly`, the privacy policy link (the site's «ماذا نحفظ؟» page).
4. **OAuth client:** type _Web application_; authorized redirect URI exactly `<ARABLYZER_SITE>/api/gsc/callback` (add `http://localhost:…` for a local run). Put its id and secret in `ARABLYZER_GSC_CLIENT_ID` and `ARABLYZER_GSC_CLIENT_SECRET`.
5. **While the app is unverified** (_Testing_ status): only the _test users_ added in the consent screen (up to 100) can connect, and Google shows an "unverified app" warning. Add the owner's and any tester's Google accounts there.
6. **Before the public launch:** `webmasters.readonly` is a _sensitive_ scope, so Google's OAuth verification is needed for anyone to connect: a verified domain, the privacy policy stating the use and that nothing is stored (it is read once, never stored), and a short demo video of the flow. Until verified, keep the app in Testing; do not publish it.

## 3. Platform check (rule `platform-detected`, tool `platform-check`)

- **What:** an information rule (never scored) and a tool page, «كشف منصة الموقع» / "Platform check", that name the CMS or store, builder, major plugins and services (analytics, CDN, frameworks) a page runs, each with its version where the page says, a confidence of 1 to 100 (75 and over is sure) and what was seen. It reads the fetched page alone: headers, cookies, meta tags, script and link addresses, the URL. Nothing runs.
- **Fingerprints:** `packages/rules/vendor/webappanalyzer/fingerprints.json` is a trimmed subset of [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) (GPL-3.0, compatible with our AGPL-3.0), pinned to commit `eea872af`, with its `LICENSE` and `SOURCE.md` beside it: CMS, e-commerce, page builders, analytics, CDN, JS frameworks, blogs, web frameworks, tag managers and WordPress plugins, and of each only the patterns a scan can read (1,861 technologies, 250 KB). Update with `packages/rules/scripts/vendor-platforms.ts` on a checkout of a newer commit.
- **Arab platforms** (`ARAB_FINGERPRINTS` in `src/lib/platforms.ts`): Salla (`x-powered-by: Salla`, `cdn.salla.network`), Zid (`zid_*` cookies, `/js/script_loader.js`, `media.zid.store`) and YouCan (`x-youcan-request-id`, `x-powered-by: Youcan.Private.DC/<version>`) were checked against public stores on 2026-10-04. ExpandCart's markers are from its documentation and were not verified, so they are low confidence. Matjrah uses upstream's marker; Tajer has no marker we trust, and is left out.
- **On the report:** `facts.platform` is `{ primary, technologies[] }` (`primary` the surest CMS or store), present when the rule ran. Fix guides can read `primary.id` and show "on Salla: ..." steps: `platformFix(ruleId, platformId, lang)` in `packages/rules/src/platform-fixes.ts` returns them. Two examples are written (`meta-description-missing` on WordPress and on Salla); the rest are for later, and no finding shows them yet.
- **Monitoring** (when it comes) will alert when the platform, its version or its plugins change, from this same fact scan to scan.
- **Ruleset:** 0.7.0. The golden reports need CI's regeneration; golden site 03 now shows WordPress.

## 4. Knowledge Graph (rule `knowledge-graph-entity`)

- **What:** an information rule. The brand's name comes from Organization-like or WebSite JSON-LD, else `og:site_name`, else the first part of the title. `entities:search` is asked for it in Arabic and in English; a result counts when its name is the brand's or starts with it or is started by it, compared without case, marks, tatweel and spaces. A finding names the entity, its types, description and Wikipedia article. A brand Google does not know has no finding (so the rule passes); `facts.knowledgeGraph` says `unknown`, `known` or `no-name`.
- **Key:** `ARABLYZER_KG_KEY`, else `ARABLYZER_CRUX_KEY` (the CLI: else `ARABLYZER_CRUX_API_KEY`), in the `X-Goog-Api-Key` header. No key or a private page: a notice and the rule does not apply; an API failure is an error and a notice, never a verdict.
- **Privacy:** the brand's name goes to Google, with the key; the page's address does not.

## 5. Open PageRank (`facts.openPageRank`, in the report's header)

- **What:** a whole scan (one with no `ruleIds`; a tool's scan asks nothing) POSTs the page's registrable domain to `https://openpagerank.keywordseverywhere.com/v1/domains/bulk` with `Authorization: Bearer <key>` and `{ domains, include_history: true }`. The report shows the 0 to 10 score, the referring domains and a trend. Source and methodology: Common Crawl's web graph. Information, never scored.
- **Trend:** the latest measured month against a measured month 6 to 12 months before it, by a third of a point: rising, stable or falling. Months the API marks `estimated` are not used; with too little history there is no trend.
- **Key:** `ARABLYZER_OPR_KEY` (free tier: 30,000 domains a month, one per scan). The scanner always passes the option, so a scan without the key says the check is off (`open-page-rank-no-key`); the CLI asks only with the key set. A private page and a platform's subdomain (no domain of its own) are not asked; a domain with `found: false` shows "not in the index yet" (`score: null`); a failure or refused key is a notice and no number.

## 6. "Your page against Arabic sites" (HTTP Archive and CrUX benchmark)

- **What:** percentiles (p25, p50, p75, p90) of page weight, requests, font bytes, LCP and CLS for Arab sites, made monthly by the owner and committed as `apps/web/src/data/httparchive-benchmark.json`; the report page reads it (`src/lib/benchmark.ts`, card `Benchmark.tsx`).
- **No numbers are invented, and none are committed yet.** The HTTP Archive and CrUX datasets are in BigQuery, which needs credentials this branch does not have, so the file says `"status": "none"` and the card says "no benchmark yet".
- **To make it** (owner, monthly, after the HTTP Archive crawl and the CrUX release; `gcloud` signed in to a project that can read the public datasets):
  1. `pnpm benchmark:httparchive -- --crawl 2026-09-01 --month 202609 --dry-run` checks both queries without reading data.
  2. Without `--dry-run` it runs `apps/web/queries/httparchive-pages.sql` (the `httparchive.crawl.pages` table: mobile root pages whose host ends in an Arab ccTLD, `summary` bytes, requests and font bytes) and `apps/web/queries/crux-arab.sql` (`chrome-ux-report.materialized.country_summary`: phone origins of Arab countries, p75 LCP and CLS), and writes the JSON. Review the diff and commit it.
  3. **The queries were written from the tables' documented columns and have not been run**: the dry run is the check, and a column that differs (the `summary` fields, `p75_lcp`, `p75_cls`, the `device` values) is fixed in the SQL file. The scope is Arab country-code domains, not the language of the page.
- **What the card compares:** the requests of the Chromium render, and CrUX's p75 LCP and CLS for the page when the report has them, each by quartile with the median beside it. The report does not measure page weight or font bytes yet, so the file holds them for when it does (they are not compared now).
