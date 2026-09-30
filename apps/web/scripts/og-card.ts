import type { Lang } from '@arablyzer/seo/site'
import { escapeHtml } from '../src/lib/code'
import { isolateLatin } from '../src/lib/bidi'
import { OG_HEIGHT, OG_WIDTH } from '../src/lib/og'

// A page's Open Graph image (M2.4c): a card in the Lab design, drawn by Chromium from this HTML,
// with nothing it loads from the network: its fonts are inline, its colours the site's tokens.

/** The site's colours, from global.css's @theme: a redesign there redraws the cards too. */
export interface CardTokens {
  readonly paper: string
  readonly ink: string
  readonly ink2: string
  readonly ink3: string
  readonly signal: string
  readonly rule: string
}

const TOKEN_NAMES: Readonly<Record<keyof CardTokens, string>> = {
  paper: 'paper',
  ink: 'ink',
  ink2: 'ink-2',
  ink3: 'ink-3',
  signal: 'signal',
  rule: 'rule-strong',
}

/** The card's colours as global.css declares them (`--color-ink: #14171c;`). */
export function tokensFrom(css: string): CardTokens {
  const read = (name: string) => {
    const value = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css)?.[1]
    if (value === undefined) throw new Error(`global.css has no --color-${name}`)
    return value
  }
  const entries = Object.entries(TOKEN_NAMES).map(([key, name]) => [key, read(name)] as const)
  return Object.fromEntries(entries) as unknown as CardTokens
}

/** The faces the card draws with, as woff2 files' bytes. */
export interface CardFonts {
  readonly arabic400: Uint8Array
  readonly arabic600: Uint8Array
  readonly latin400: Uint8Array
  readonly latin600: Uint8Array
  readonly mono600: Uint8Array
}

export interface Card {
  readonly lang: Lang
  /** Above the title: what the page is (a tool and its category, a rule's id, a section). */
  readonly kicker: string
  /** The kicker is code, such as a rule's id: set in the mono face, left to right. */
  readonly kickerCode?: boolean
  readonly title: string
  readonly description: string
  /** The site's host, at the card's foot. */
  readonly host: string
}

const face = (family: string, weight: number, bytes: Uint8Array, range?: string) =>
  `@font-face{font-family:'${family}';font-weight:${String(weight)};font-display:block;src:url(data:font/woff2;base64,${Buffer.from(bytes).toString('base64')}) format('woff2');${range === undefined ? '' : `unicode-range:${range};`}}`

/** Arabic text with its Latin runs isolated, as the pages set it (src/lib/bidi.ts). */
function text(value: string, lang: Lang): string {
  if (lang !== 'ar') return escapeHtml(value)
  return isolateLatin(value)
    .map((part) =>
      part.isolate ? `<bdi dir="ltr">${escapeHtml(part.text)}</bdi>` : escapeHtml(part.text),
    )
    .join('')
}

/** The card as a whole document, 1200 × 630, for Chromium to draw. */
export function cardHtml(card: Card, tokens: CardTokens, fonts: CardFonts): string {
  const dir = card.lang === 'ar' ? 'rtl' : 'ltr'
  const arabicRange = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF'
  const kicker =
    card.kickerCode === true
      ? `<span class="kicker code" dir="ltr">${escapeHtml(card.kicker)}</span>`
      : `<span class="kicker">${text(card.kicker, card.lang)}</span>`
  return `<!doctype html>
<html lang="${card.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<style>
${face('Plex', 400, fonts.arabic400, arabicRange)}
${face('Plex', 600, fonts.arabic600, arabicRange)}
${face('Plex', 400, fonts.latin400)}
${face('Plex', 600, fonts.latin600)}
${face('Plex Mono', 600, fonts.mono600)}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  width: ${String(OG_WIDTH)}px; height: ${String(OG_HEIGHT)}px; overflow: hidden;
  font-family: 'Plex', sans-serif; color: ${tokens.ink};
  background-color: ${tokens.paper};
  background-image:
    linear-gradient(to right, rgb(20 23 28 / 0.065) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(20 23 28 / 0.065) 1px, transparent 1px),
    linear-gradient(to right, rgb(20 23 28 / 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(20 23 28 / 0.03) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
}
.card {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  padding: 56px 72px 48px; border-top: 14px solid ${tokens.ink};
}
.brand { display: flex; align-items: center; gap: 16px; }
.brand .name { font-family: 'Plex Mono', monospace; font-weight: 600; font-size: 30px; direction: ltr; }
.brand .line { font-size: 22px; color: ${tokens.ink3}; }
.body { margin-top: auto; margin-bottom: auto; display: flex; flex-direction: column; gap: 22px; }
.kicker {
  align-self: flex-start; font-size: 24px; font-weight: 600; color: ${tokens.signal};
  border: 2px solid ${tokens.signal}; padding: 6px 16px;
}
.kicker.code { font-family: 'Plex Mono', monospace; }
h1 {
  margin: 0; font-size: ${card.title.length > 60 ? '54px' : '64px'}; line-height: 1.25; font-weight: 600;
  text-wrap: balance; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
p {
  margin: 0; font-size: 28px; line-height: 1.6; color: ${tokens.ink2}; max-width: 1000px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.foot {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 2px solid ${tokens.ink}; padding-top: 18px;
  font-family: 'Plex Mono', monospace; font-weight: 600; font-size: 22px; color: ${tokens.ink3}; direction: ltr;
}
.foot .mark { color: ${tokens.signal}; }
</style>
</head>
<body>
<div class="card">
  <div class="brand">
    <svg width="44" height="44" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="23" height="23" stroke="${tokens.ink}" stroke-width="1.5"></rect>
      <path d="M15 3.5v6M15 20.5v6M3.5 15h6M20.5 15h6" stroke="${tokens.ink}" stroke-width="1.5"></path>
      <circle cx="15" cy="15" r="3.2" stroke="${tokens.signal}" stroke-width="1.8"></circle>
    </svg>
    <span class="name">Arablyzer</span>
    <span class="line">${card.lang === 'ar' ? 'محلّل المواقع العربية' : 'Arabic website analyzer'}</span>
  </div>
  <div class="body">
    ${kicker}
    <h1>${text(card.title, card.lang)}</h1>
    <p>${text(card.description, card.lang)}</p>
  </div>
  <div class="foot"><span>${escapeHtml(card.host)}</span><span class="mark">LAB-001</span></div>
</div>
</body>
</html>`
}
