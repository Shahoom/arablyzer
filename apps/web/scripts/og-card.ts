import type { Lang } from '@arablyzer/seo/site'
import { escapeHtml } from '../src/lib/code'
import { isolateLatin } from '../src/lib/bidi'
import { OG_HEIGHT, OG_WIDTH } from '../src/lib/og'

// A page's Open Graph image (M2.4c): a card in the v2 design (M2.6), drawn by Chromium from this
// HTML, with nothing it loads from the network: its fonts are inline, its colours the site's tokens.

/** The site's colours, from global.css's @theme: a redesign there redraws the cards too. */
export interface CardTokens {
  /** The ground, the page's own (`bg`). */
  readonly bg: string
  readonly ink: string
  readonly ink2: string
  readonly ink3: string
  readonly signal: string
  /** The hairline over the card's foot (`line-2`). */
  readonly line: string
  /** The tint and the ink of the kicker's pill. */
  readonly soft: string
  readonly softInk: string
}

const TOKEN_NAMES: Readonly<Record<keyof CardTokens, string>> = {
  bg: 'bg',
  ink: 'ink',
  ink2: 'ink-2',
  ink3: 'ink-3',
  // The card's accent is the brand's teal (the v2 system has no "signal" colour).
  signal: 'brand-ink',
  line: 'line-2',
  soft: 'indigo-soft',
  softInk: 'indigo-ink',
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
  background-color: ${tokens.bg};
  /* Two soft lights in the corners, where the home page's aurora has them. */
  background-image:
    radial-gradient(540px 420px at 100% 0%, rgb(94 234 212 / 0.38), transparent 70%),
    radial-gradient(620px 460px at 0% 100%, rgb(165 180 252 / 0.45), transparent 70%);
}
.bar { height: 14px; background: linear-gradient(120deg, #00727c, #4f46e5); }
.card {
  width: 100%; height: ${String(OG_HEIGHT - 14)}px; display: flex; flex-direction: column;
  padding: 48px 72px 48px;
}
.brand { display: flex; align-items: center; gap: 16px; }
.brand .name { font-weight: 600; font-size: 32px; direction: ltr; }
.brand .line { font-size: 22px; color: ${tokens.ink3}; }
.body { margin-top: auto; margin-bottom: auto; display: flex; flex-direction: column; gap: 22px; }
.kicker {
  align-self: flex-start; font-size: 24px; font-weight: 600; color: ${tokens.softInk};
  background: ${tokens.soft}; border-radius: 999px; padding: 6px 20px;
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
  border-top: 2px solid ${tokens.line}; padding-top: 18px;
  font-family: 'Plex Mono', monospace; font-weight: 600; font-size: 22px; color: ${tokens.signal}; direction: ltr;
}
</style>
</head>
<body>
<div class="bar"></div>
<div class="card">
  <div class="brand">
    <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#007d88"></stop><stop offset="1" stop-color="#4f46e5"></stop></linearGradient></defs>
      <rect width="32" height="32" rx="10" fill="url(#m)"></rect>
      <path d="M24 10.5H8.5M24 16H12.5M24 21.5H16.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"></path>
    </svg>
    <span class="name">Arablyzer</span>
    <span class="line">${card.lang === 'ar' ? 'محلّل المواقع العربية' : 'Arabic website analyzer'}</span>
  </div>
  <div class="body">
    ${kicker}
    <h1>${text(card.title, card.lang)}</h1>
    <p>${text(card.description, card.lang)}</p>
  </div>
  <div class="foot"><span>${escapeHtml(card.host)}</span></div>
</div>
</body>
</html>`
}
