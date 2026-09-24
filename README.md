# Arablyzer

**محلّل المواقع العربية** — أداة مفتوحة المصدر لفحص المواقع العربية والخليجية، أول مشروع في مختبر كلاود توبيا (LAB-001).

> **الحالة:** قيد البناء — المرحلة 0 (الأساس). لا يوجد إصدار منشور بعد؛ الأداة تعمل من المستودع فقط.

Open-source website analyzer for Arabic and Gulf websites. **Status:** in development (Phase 0); nothing is released yet, and the CLI runs from this repository only.

## Development

Requires Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e      # builds the CLI and scans every fixture site
```

- Plan (source of truth, Arabic): [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)
- Phase 0 design: [`docs/design/phase-0.md`](docs/design/phase-0.md)

## Scanning a page / فحص صفحة

```bash
pnpm arablyzer https://example.com                    # text report, in Arabic when LANG is Arabic
pnpm arablyzer https://example.com --lang en          # text report in English
pnpm arablyzer https://example.com --json             # the full report as JSON on stdout
pnpm arablyzer https://example.com --fail-on serious  # exit 1 when a serious or critical rule fails
pnpm arablyzer --help
```

Exit codes: `0` the scan completed; `1` a rule failed at `--fail-on` or above; `2` the scan did not complete (blocked or unreachable address, time limit, partial scan) or the options were invalid. The JSON report follows [`packages/report-schema/report.schema.json`](packages/report-schema/report.schema.json).

Arablyzer fetches pages as `ArablyzerBot/1.0 (+https://arablyzer.com/bot)`, only through its SSRF guard (`packages/egress`): private, loopback, link-local and metadata addresses are refused. `--allow-private` opens private and loopback addresses for local builds; link-local and metadata addresses stay blocked.

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

## License

[AGPL-3.0-only](LICENSE).
