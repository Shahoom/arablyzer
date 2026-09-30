# Arablyzer

**محلّل المواقع العربية** — أداة مفتوحة المصدر لفحص المواقع العربية والخليجية، أول مشروع في مختبر كلاود توبيا (LAB-001).

> **الحالة:** قيد البناء — المرحلة 1 (عرض الصفحة في متصفح). لا يوجد إصدار منشور بعد؛ الأداة تعمل من المستودع فقط.

Open-source website analyzer for Arabic and Gulf websites. **Status:** in development (Phase 1: rendering pages in a browser); nothing is released yet, and the CLI runs from this repository only.

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

- Plan (source of truth, Arabic): [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)
- Designs: [Phase 0](docs/design/phase-0.md), [Phase 1](docs/design/phase-1.md)

## Scanning a page / فحص صفحة

```bash
pnpm arablyzer https://example.com                    # text report, in Arabic when LANG is Arabic
pnpm arablyzer https://example.com --lang en          # text report in English
pnpm arablyzer https://example.com --json             # the full report as JSON on stdout
pnpm arablyzer https://example.com --fail-on serious  # exit 1 when a serious or critical rule fails
pnpm arablyzer https://example.com --render           # also render the page in Chromium
pnpm arablyzer https://example.com --engines chromium,firefox --screenshots shots
pnpm arablyzer --help
```

Exit codes: `0` the scan completed; `1` a rule failed at `--fail-on` or above; `2` the scan did not complete (blocked or unreachable address, time limit, partial scan) or the options were invalid. The JSON report follows [`packages/report-schema/report.schema.json`](packages/report-schema/report.schema.json).

Arablyzer fetches pages as `ArablyzerBot/1.0 (+https://arablyzer.com/bot)`, only through its SSRF guard (`packages/egress`): private, loopback, link-local and metadata addresses are refused. `--allow-private` opens private and loopback addresses for local builds; link-local and metadata addresses, and the machine's own public addresses, stay blocked. Text printed from a scanned page is escaped, so a page cannot send terminal control sequences.

With `--render`, the page is also rendered in a browser, one engine after the other, each behind its own egress proxy that vets every request the page makes by the same rules; `--screenshots <dir>` saves the first screen of each as `<dir>/<engine>.png`. WebKit sends WebRTC traffic around the proxy, so it runs only in a container whose network reaches nothing but the proxy, marked by `ARABLYZER_NETWORK_ISOLATED=1`; elsewhere `--engines webkit` is refused and `--engines all` means Chromium and Firefox. On macOS WebKit never runs, even with that variable: there it also sends redirects and navigations to local addresses around the proxy.

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
| [`form-arabic-name-rejected`](packages/rules/src/rules/form-arabic-name-rejected/copy.en.md) | Name fields' `pattern` accepts Arabic names |
| [`form-arabic-digits-rejected`](packages/rules/src/rules/form-arabic-digits-rejected/copy.en.md) | Number fields' `pattern` accepts Arabic-Indic digits |

These read the page as a browser rendered it, so they run with `--render`:

| Rule | Checks |
|---|---|
| [`ar-letter-spacing`](packages/rules/src/rules/ar-letter-spacing/copy.en.md) | No `letter-spacing` pulls Arabic letters apart |
| [`ar-font-fallback`](packages/rules/src/rules/ar-font-fallback/copy.en.md) | The web font set for Arabic text loaded |
| [`ar-font-no-arabic`](packages/rules/src/rules/ar-font-no-arabic/copy.en.md) | The web font set for Arabic text has the Arabic letters (Chromium) |
| [`rtl-bidi-isolation`](packages/rules/src/rules/rtl-bidi-isolation/copy.en.md) | Numbers and Latin words inside right-to-left text are drawn in order |
| [`rtl-horizontal-overflow`](packages/rules/src/rules/rtl-horizontal-overflow/copy.en.md) | A right-to-left page fits a phone screen without scrolling sideways |
| [`a11y-image-alt`](packages/rules/src/rules/a11y-image-alt/copy.en.md) | Images have a text alternative (axe-core) |
| [`a11y-color-contrast`](packages/rules/src/rules/a11y-color-contrast/copy.en.md) | Text, Arabic included, has the contrast WCAG asks for (axe-core) |
| [`a11y-color-contrast-review`](packages/rules/src/rules/a11y-color-contrast-review/copy.en.md) | Text whose contrast axe-core cannot measure, such as text over an image, for review |
| [`a11y-link-name`](packages/rules/src/rules/a11y-link-name/copy.en.md) | Links have an accessible name (axe-core) |
| [`a11y-button-name`](packages/rules/src/rules/a11y-button-name/copy.en.md) | Buttons have an accessible name (axe-core) |
| [`a11y-valid-lang`](packages/rules/src/rules/a11y-valid-lang/copy.en.md) | `lang` attributes inside the page name a language (axe-core) |
| [`form-label-missing`](packages/rules/src/rules/form-label-missing/copy.en.md) | Form fields have a label (axe-core) |
| [`form-phone-direction`](packages/rules/src/rules/form-phone-direction/copy.en.md) | Phone fields show numbers left to right |

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
