# Arablyzer

**محلّل المواقع العربية** — أداة مفتوحة المصدر لفحص المواقع العربية والخليجية، أول مشروع في مختبر كلاود توبيا (LAB-001).

> **الحالة:** قيد البناء — المرحلة 2 (الموقع والفحص المجاني). لا يوجد إصدار منشور بعد؛ الأداة تعمل من المستودع فقط.

Open-source website analyzer for Arabic and Gulf websites. **Status:** in development (Phase 2: the site and the free scan); nothing is released yet, and the CLI runs from this repository only.

## Development

Requires Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e      # builds the CLI and scans every fixture site
pnpm seo:audit     # renders every tool page and the report template, and audits them
pnpm test:browser  # the browser SSRF suite, rendered facts and render rule fixtures
```

`pnpm test:browser` needs a browser. `npx playwright-core@1.63.0 install chromium firefox webkit` installs Playwright's own; `ARABLYZER_CHROMIUM_PATH` (and `_FIREFOX_`, `_WEBKIT_`) points at an installed one instead. CI installs all three and sets `ARABLYZER_REQUIRE_ENGINES=chromium,firefox,webkit`, so a missing engine fails the run.

### The scanner image and the golden reports

The `Dockerfile` builds the scanner image: Node 24, the three browsers Playwright pins, and the fonts they draw with, listed in [`fixtures/golden/fonts.txt`](fixtures/golden/fonts.txt), so what the browsers draw does not depend on the machine. CI builds it for linux/amd64 on every pull request and never pushes it.

The twenty pages in [`fixtures/golden/sites`](fixtures/golden/sites) between them fail every rule, and each rule that does more than ask for a review passes on one of them too. Their reports in [`fixtures/golden/reports`](fixtures/golden/reports) come from the image alone, since fonts and rendering differ between machines: they hold for linux/amd64. CI scans the pages again in the image and compares, leaving out times and the date of a test certificate; a report that differs, or has none yet, is kept as the `golden-actual` artifact, which is where reports are committed from. A change to a golden report needs explicit approval in its pull request. The three pages served over HTTPS are scanned without the browsers, which do not trust the test certificate authority of the fixtures; Arablyzer never loosens that.

```bash
docker build --platform linux/amd64 -t arablyzer .
# Compare, as CI does; --network none leaves loopback alone, so WebKit renders too. What differs,
# or has no report yet (fonts.txt too), is written to golden-actual/, to review and copy over.
mkdir -p golden-actual && chmod 777 golden-actual
docker run --rm --platform linux/amd64 --network none -e ARABLYZER_NETWORK_ISOLATED=1 \
  -e ARABLYZER_GOLDEN_OUT=/out -v "$PWD/golden-actual:/out" --entrypoint pnpm arablyzer test:golden
```

### The site / الموقع

`apps/web` is the site: Astro builds static pages, Arabic at the root and English under `/en/`, and React runs only the scan form. The home page reads its numbers from the golden reports at build time.

```bash
pnpm --filter @arablyzer/web dev      # http://localhost:4321; /api goes to ARABLYZER_API_ORIGIN
pnpm site:build && pnpm site:audit    # builds apps/web/dist and audits every page, as CI does
pnpm --filter @arablyzer/web test:browser   # after site:build: Arablyzer scans its own pages (WebKit on Linux only)
CHROME_PATH=/path/to/chromium pnpm --filter @arablyzer/web run lighthouse --runs 3
```

Pages are built for `https://arablyzer.example` until the domain is chosen; `ARABLYZER_SITE` sets another origin.

### The API and the worker / الخادم والعامل

`apps/api` takes a scan (`POST /api/scans`), streams its steps (`GET /api/scans/:id/events`) and serves its report (`GET /api/reports/:id`, never indexed); `apps/worker` takes each queued scan and has `apps/scanner`, the engine and its browsers, run it. `packages/store` keeps scans in PostgreSQL and the queue, the events and the limits in Valkey, with in-memory versions for tests and development. The scanner reads a page's HTML in a thread with a heap and a clock of its own, so a page too big for it is reported as too complex and never ends the scanner; and the worker waits for a scanner that is not there, so a scanner that is starting again fails no scan ([`docs/design/plans/m3.1-security.md`](docs/design/plans/m3.1-security.md)).

```bash
pnpm --filter @arablyzer/api dev   # the API and a worker in one process, on http://127.0.0.1:8787
pnpm --filter @arablyzer/web dev   # the site, sending /api to it
ARABLYZER_TEST_VALKEY_URL=redis://127.0.0.1:6379 \
ARABLYZER_TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db pnpm test:services
```

`ARABLYZER_ALLOW_PRIVATE=1` lets the development API scan local pages, such as the fixture sites; production refuses it. The limits' numbers are the owner's decision: `packages/plans` holds development values, and production will not start without its own (`ARABLYZER_LIMIT_*`), `TURNSTILE_SECRET`, `ARABLYZER_SITE` and `ARABLYZER_LIMIT_SECRET`. The API's and the worker's production entrypoints (`server.ts`, `main.ts`) apply those checks whatever `NODE_ENV` says; `dev.ts` is the development one.

### The stack / تشغيل كل شيء معاً

`infra/compose.yaml` runs everything on one host: the site's server (Caddy), the API, the worker, the scanner with its browsers, the egress proxy (Smokescreen, with a port check and the egress package's deny list), Valkey and PostgreSQL. The scanner's browsers see the egress proxy alone, and no store; every name they ask for is resolved and vetted there. The internal networks give the host no address, so nothing on them reaches the host's own services either: that takes Docker Engine 28 or later, and since Docker ignores a network option it does not know, `pnpm test:stack` checks it on the Docker that runs it. The site's server listens on the host's loopback, for the host's own proxy, which terminates TLS in front of it. Every container runs read-only, without privileges, with caps on memory, CPU and processes.

```bash
cp infra/.env.example infra/.env        # then fill it in
docker compose -f infra/compose.yaml up --build
# End to end, with golden site 04 served inside the stack, as CI does:
docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up --detach --build --wait
pnpm test:stack
```

The egress proxy's configuration is generated from `packages/egress`, its deny list and its limits: `pnpm --filter @arablyzer/egress smokescreen-config` writes `infra/egress/smokescreen.yaml`, and the egress tests check the two agree. The proxy's own tests (`infra/egress/main_test.go`) run as its image is built.

- Plan (source of truth, Arabic): [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)
- Designs: [Phase 0](docs/design/phase-0.md), [Phase 1](docs/design/phase-1.md), [Phase 2](docs/design/phase-2.md)

## Scanning a page / فحص صفحة

```bash
pnpm arablyzer https://example.com                    # text report, in Arabic when LANG is Arabic
pnpm arablyzer https://example.com --lang en          # text report in English
pnpm arablyzer https://example.com --json             # the full report as JSON on stdout
pnpm arablyzer https://example.com --fail-on serious  # exit 1 when a serious or critical rule fails
pnpm arablyzer https://example.com --render           # also render the page in Chromium
pnpm arablyzer https://example.com --engines chromium,firefox --screenshots shots
pnpm arablyzer https://example.com --lab              # also Lighthouse's lab metrics, as information
pnpm arablyzer --help
```

Exit codes: `0` the scan completed; `1` a rule failed at `--fail-on` or above; `2` the scan did not complete (blocked or unreachable address, time limit, partial scan) or the options were invalid. The JSON report follows [`packages/report-schema/report.schema.json`](packages/report-schema/report.schema.json).

Arablyzer fetches pages as `ArablyzerBot/1.0 (+https://arablyzer.com/bot)`, only through its SSRF guard (`packages/egress`): private, loopback, link-local and metadata addresses are refused. `--allow-private` opens private and loopback addresses for local builds; link-local and metadata addresses, and the machine's own public addresses, stay blocked. Text printed from a scanned page is escaped, so a page cannot send terminal control sequences.

With `--render`, the page is also rendered in a browser, one engine after the other, each behind its own egress proxy that vets every request the page makes by the same rules; `--screenshots <dir>` saves the first screen of each as `<dir>/<engine>.png`. WebKit sends WebRTC traffic around the proxy, so it runs only in a container whose network reaches nothing but the proxy, marked by `ARABLYZER_NETWORK_ISOLATED=1`; elsewhere `--engines webkit` is refused and `--engines all` means Chromium and Firefox. On macOS WebKit never runs, even with that variable: there it also sends redirects and navigations to local addresses around the proxy.

With `--lab`, Lighthouse 13 measures the page on an emulated phone in the render's Chromium (Playwright's headless shell), behind its own egress proxy and the render's limits. Its metrics vary from run to run, so the report gives them as information: they are never findings, and never part of the score.

Real visitors' Core Web Vitals come from Google's Chrome UX Report (CrUX), with an API key in `ARABLYZER_CRUX_API_KEY` (created in Google Cloud for the Chrome UX Report API): visits in Chrome by users who share usage statistics and sync their history; Chrome on iPhone is not counted. The page's URL is then sent to Google; a page on a private address never is. Without a key, the three rules that read CrUX do not apply, and a notice says so.

## Rules / القواعد

Each rule lives in `packages/rules/src/rules/<id>/` with its detector, tests, wrong and right fixture sites, and its rule-library page in Arabic (`copy.ar.md`) and English (`copy.en.md`).

| Rule | Checks |
|---|---|
| [`ar-html-lang`](packages/rules/src/rules/ar-html-lang/copy.en.md) | An Arabic page declares an Arabic-script language in `<html lang>` |
| [`rtl-html-dir`](packages/rules/src/rules/rtl-html-dir/copy.en.md) | An Arabic page has `dir="rtl"` on `<html>` |
| [`ar-latin-punctuation`](packages/rules/src/rules/ar-latin-punctuation/copy.en.md) | Arabic text uses ، ؛ ؟ rather than , ; ? |
| [`whatsapp-link-format`](packages/rules/src/rules/whatsapp-link-format/copy.en.md) | WhatsApp click-to-chat numbers are in full international format |
| [`hreflang-invalid-code`](packages/rules/src/rules/hreflang-invalid-code/copy.en.md) | hreflang values are valid ISO codes or `x-default` |
| [`robots-blocks-googlebot`](packages/rules/src/rules/robots-blocks-googlebot/copy.en.md) | robots.txt does not block Googlebot from the page |
| [`robots-blocks-ai-search`](packages/rules/src/rules/robots-blocks-ai-search/copy.en.md) | robots.txt does not block AI search crawlers |
| [`page-noindex`](packages/rules/src/rules/page-noindex/copy.en.md) | No `noindex` in meta robots or `X-Robots-Tag` |
| [`canonical-conflict`](packages/rules/src/rules/canonical-conflict/copy.en.md) | The page gives at most one canonical URL |
| [`jsonld-syntax-error`](packages/rules/src/rules/jsonld-syntax-error/copy.en.md) | JSON-LD blocks are valid JSON |
| [`title-missing`](packages/rules/src/rules/title-missing/copy.en.md) | The page has a `<title>` with text |
| [`meta-description-missing`](packages/rules/src/rules/meta-description-missing/copy.en.md) | The page has a meta description with text |
| [`h1-missing`](packages/rules/src/rules/h1-missing/copy.en.md) | The page has an `<h1>` with text |
| [`viewport-missing`](packages/rules/src/rules/viewport-missing/copy.en.md) | A viewport tag with `width=device-width` fits the page to phone screens |
| [`og-tags-missing`](packages/rules/src/rules/og-tags-missing/copy.en.md) | `og:title`, `og:description` and `og:image` are there for link previews |
| [`ar-mojibake`](packages/rules/src/rules/ar-mojibake/copy.en.md) | No Arabic decoded in the wrong encoding, such as «Ø§Ù„» or «ÇáÚÑÈíÉ» |
| [`ar-digits-mixed`](packages/rules/src/rules/ar-digits-mixed/copy.en.md) | An Arabic page writes its numbers in one digit set |
| [`ar-tatweel`](packages/rules/src/rules/ar-tatweel/copy.en.md) | No words stretched with tatweel (ـ) |
| [`product-offer-invalid`](packages/rules/src/rules/product-offer-invalid/copy.en.md) | JSON-LD product offers have a price and an ISO 4217 currency, written as Schema.org asks |
| [`price-decimals`](packages/rules/src/rules/price-decimals/copy.en.md) | Prices in Omani rials and Kuwaiti or Bahraini dinars have three decimals |
| [`payment-methods`](packages/rules/src/rules/payment-methods/copy.en.md) | Which of mada, Apple Pay, STC Pay, Tabby and Tamara the page shows, by its logos' names and the providers' scripts (information) |
| [`form-arabic-name-rejected`](packages/rules/src/rules/form-arabic-name-rejected/copy.en.md) | Name fields' `pattern` accepts Arabic names |
| [`form-arabic-digits-rejected`](packages/rules/src/rules/form-arabic-digits-rejected/copy.en.md) | Number fields' `pattern` accepts Arabic-Indic digits |
| [`https-missing`](packages/rules/src/rules/https-missing/copy.en.md) | A public page is served over HTTPS |
| [`hsts-missing`](packages/rules/src/rules/hsts-missing/copy.en.md) | An HTTPS page sends `Strict-Transport-Security` |
| [`csp-missing`](packages/rules/src/rules/csp-missing/copy.en.md) | A public page enforces a Content Security Policy, in its header or a `<meta>` in `<head>` |
| [`x-content-type-options-missing`](packages/rules/src/rules/x-content-type-options-missing/copy.en.md) | A public page sends `X-Content-Type-Options: nosniff` |
| [`frame-protection-missing`](packages/rules/src/rules/frame-protection-missing/copy.en.md) | A public page keeps other sites from framing it, with `frame-ancestors` or `X-Frame-Options` |
| [`referrer-policy-missing`](packages/rules/src/rules/referrer-policy-missing/copy.en.md) | A public page states its referrer policy, in a `Referrer-Policy` header or a `<meta name="referrer">` (information) |
| [`mixed-content`](packages/rules/src/rules/mixed-content/copy.en.md) | An HTTPS page loads nothing over `http:`, and its forms send nothing there |
| [`tls-expiring`](packages/rules/src/rules/tls-expiring/copy.en.md) | The TLS certificate is not about to expire |
| [`redirect-chain`](packages/rules/src/rules/redirect-chain/copy.en.md) | The page is reached through one redirect at most |
| [`redirect-temporary`](packages/rules/src/rules/redirect-temporary/copy.en.md) | A move to HTTPS, or between a name and its `www.`, is a permanent redirect (301 or 308) |
| [`bot-challenge`](packages/rules/src/rules/bot-challenge/copy.en.md) | The site answers the check with the page, not a Cloudflare or AWS WAF bot challenge (information) |
| [`sitemap-missing`](packages/rules/src/rules/sitemap-missing/copy.en.md) | A public site names a sitemap in robots.txt, or has one at `/sitemap.xml` |
| [`sitemap-invalid`](packages/rules/src/rules/sitemap-invalid/copy.en.md) | The site's sitemaps can be fetched and read: well-formed XML in the protocol's namespace, a feed, or a list of full URLs |

These read TXT records of the page's domain (its organizational domain, by the Public Suffix List). The hosted service asks for them as DNS over HTTPS (RFC 8484) from Cloudflare's resolver, or from the one `ARABLYZER_DOH_URL` names, through the egress proxy; a scan on a machine without a proxy asks that machine's DNS servers. A site a platform gives its customers (`user.github.io`, `shop.myshopify.com`) has no domain of its own to read: they do not apply to it. A scan with no way to ask DNS leaves them out and says so:

| Rule | Checks |
|---|---|
| [`spf-missing`](packages/rules/src/rules/spf-missing/copy.en.md) | The page's domain has one SPF record (`v=spf1`) |
| [`dmarc-missing`](packages/rules/src/rules/dmarc-missing/copy.en.md) | The page's domain has one DMARC record (`v=DMARC1` at `_dmarc`) with a `p` tag (`none`, `quarantine` or `reject`) |

This one asks for the page's links to its own origin, the first 50 that robots.txt does not keep from ArablyzerBot or from every crawler (`User-agent: *`), each with one `HEAD` (and a `GET` where `HEAD` answers an error or the connection fails), through the egress proxy, following no redirect:

| Rule | Checks |
|---|---|
| [`link-broken`](packages/rules/src/rules/link-broken/copy.en.md) | No link to the site's own pages answers a `4xx` or `5xx` error (a `401`, `403`, `407`, `429` or `503`, by which a site refuses a bot, is not one) |

These read real visits from CrUX, so they run with `ARABLYZER_CRUX_API_KEY`:

| Rule | Checks |
|---|---|
| [`cwv-lcp-poor`](packages/rules/src/rules/cwv-lcp-poor/copy.en.md) | Largest Contentful Paint on phones is not in Google's poor range (over 4 s at the 75th percentile) |
| [`cwv-inp-poor`](packages/rules/src/rules/cwv-inp-poor/copy.en.md) | Interaction to Next Paint on phones is not in Google's poor range (over 500 ms) |
| [`cwv-cls-poor`](packages/rules/src/rules/cwv-cls-poor/copy.en.md) | Cumulative Layout Shift on phones is not in Google's poor range (over 0.25) |

These read the page as a browser rendered it, so they run with `--render`:

| Rule | Checks |
|---|---|
| [`ar-letter-spacing`](packages/rules/src/rules/ar-letter-spacing/copy.en.md) | No `letter-spacing` pulls Arabic letters apart |
| [`ar-font-fallback`](packages/rules/src/rules/ar-font-fallback/copy.en.md) | The web font set for Arabic text loaded |
| [`ar-font-no-arabic`](packages/rules/src/rules/ar-font-no-arabic/copy.en.md) | The web font set for Arabic text has the Arabic letters (Chromium) |
| [`ar-font-missing-letters`](packages/rules/src/rules/ar-font-missing-letters/copy.en.md) | The web font set for Arabic text has every character the text uses, such as «ڤ» or «٣», read from the font files |
| [`rtl-bidi-isolation`](packages/rules/src/rules/rtl-bidi-isolation/copy.en.md) | Numbers and Latin words inside right-to-left text are drawn in order |
| [`rtl-horizontal-overflow`](packages/rules/src/rules/rtl-horizontal-overflow/copy.en.md) | A right-to-left page fits a phone screen without scrolling sideways |
| [`rtl-physical-css`](packages/rules/src/rules/rtl-physical-css/copy.en.md) | A right-to-left page's CSS sets sides by start and end rather than left and right (information) |
| [`rtl-mirrored-icons`](packages/rules/src/rules/rtl-mirrored-icons/copy.en.md) | Arrows and chevrons that point right in right-to-left text, for review |
| [`a11y-image-alt`](packages/rules/src/rules/a11y-image-alt/copy.en.md) | Images have a text alternative (axe-core) |
| [`a11y-color-contrast`](packages/rules/src/rules/a11y-color-contrast/copy.en.md) | Text, Arabic included, has the contrast WCAG asks for (axe-core) |
| [`a11y-color-contrast-review`](packages/rules/src/rules/a11y-color-contrast-review/copy.en.md) | Text whose contrast axe-core cannot measure, such as text over an image, for review |
| [`a11y-link-name`](packages/rules/src/rules/a11y-link-name/copy.en.md) | Links have an accessible name (axe-core) |
| [`a11y-button-name`](packages/rules/src/rules/a11y-button-name/copy.en.md) | Buttons have an accessible name (axe-core) |
| [`a11y-valid-lang`](packages/rules/src/rules/a11y-valid-lang/copy.en.md) | `lang` attributes inside the page name a language (axe-core) |
| [`form-label-missing`](packages/rules/src/rules/form-label-missing/copy.en.md) | Form fields have a label (axe-core) |
| [`form-phone-direction`](packages/rules/src/rules/form-phone-direction/copy.en.md) | Phone fields show numbers left to right |
| [`text-compression-missing`](packages/rules/src/rules/text-compression-missing/copy.en.md) | Text is sent compressed where gzip would save much |
| [`image-format-legacy`](packages/rules/src/rules/image-format-legacy/copy.en.md) | Images are not in older formats much larger than AVIF |
| [`js-only-content`](packages/rules/src/rules/js-only-content/copy.en.md) | More than half of the Arabic words a browser draws are in the HTML the scan received, hidden text and `<noscript>` included (a browser that draws fewer than 20 is not judged) |

## The score / الدرجة

Each scan scores the page from 0 to 100, overall and by category: `100 × (1 − failed weight ÷ applicable weight)`, with weights by severity (critical 10, serious 5, moderate 3, minor 1, information 0). [`docs/methodology.md`](docs/methodology.md) explains it in Arabic and English, with a worked example for each weight, and the limits of each source.

## Tools / الأدوات

A tool is a set of rules plus its page (BUILD-PLAN §6.1). Each tool lives in `packages/tools/src/tools/<slug>/`, with its page copy in Arabic (`copy.ar.md`) and English (`copy.en.md`); a test runs the tool's rules on the wrong and right examples its page shows.

| Tool | Rules |
|---|---|
| [`rtl-check`](packages/tools/src/tools/rtl-check/copy.en.md) | `rtl-html-dir`, `ar-html-lang` |
| [`whatsapp-link-check`](packages/tools/src/tools/whatsapp-link-check/copy.en.md) | `whatsapp-link-format` |
| [`ai-crawler-check`](packages/tools/src/tools/ai-crawler-check/copy.en.md) | `robots-blocks-ai-search` |

`packages/seo` renders the tool pages (canonical, reciprocal hreflang, JSON-LD) and the report template, which is always `noindex`. `pnpm seo:audit` audits them in CI; `pnpm seo:audit --out <dir>` also writes the pages. Nothing is published: until the domain is chosen, pages are rendered for `https://arablyzer.example`.

## License

[AGPL-3.0-only](LICENSE).
