# Google signals: Safe Browsing and Search Console

Two Google integrations, both optional and both off without their keys. Neither stores anything of Google's.

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
