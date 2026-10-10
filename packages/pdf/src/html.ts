import { DEFAULT_BRAND_COLOR } from './contrast'
import { fontCss } from './fonts'
import type { Block, PdfDocument } from './model'

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
/** Text for an element or an attribute: every character that could open markup is replaced. */
export const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** A CSS string literal's contents: no quote, backslash or line break can end it early. */
const cssString = (value: string): string =>
  value.replace(/[\\"\n\r\f<>&]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)

/** Text with `code` spans: the spans are drawn left to right in the mono face, isolated from the line around them. */
function inline(value: string): string {
  return value
    .split('`')
    .map((part, index) => (index % 2 === 1 ? `<code dir="ltr">${esc(part)}</code>` : esc(part)))
    .join('')
}

/** A variable string (a site's title or address): its direction is its own, and does not leak into the line. */
const isolated = (value: string): string => `<bdi>${inline(value)}</bdi>`

function simple(block: Extract<Block, { t: 'p' | 'list' | 'code' }>): string {
  switch (block.t) {
    case 'p':
      return `<p>${inline(block.text)}</p>`
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`
    }
    case 'code':
      return `<pre dir="ltr"><code>${esc(block.text)}</code></pre>`
  }
}

function blockHtml(block: Block): string {
  switch (block.t) {
    case 'p':
    case 'list':
    case 'code':
      return simple(block)
    case 'stats':
      return `<div class="stats">${block.items
        .map(
          (item) =>
            `<div class="stat ${item.tone ?? 'neutral'}"><span class="value">${esc(item.value)}</span><span class="label">${esc(item.label)}</span></div>`,
        )
        .join('')}</div>`
    case 'table':
      return (
        `<table><thead><tr>${block.head.map((cell) => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead>` +
        `<tbody>${block.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      )
    case 'image':
      return `<figure><img src="${esc(block.src)}" alt="${esc(block.alt)}"><figcaption>${inline(block.caption)}</figcaption></figure>`
    case 'issue':
      return (
        `<article class="issue ${block.severity}">` +
        `<header><span class="chip">${esc(block.chip)}</span><h3>${isolated(block.title)}</h3></header>` +
        (block.meta === undefined ? '' : `<p class="meta">${inline(block.meta)}</p>`) +
        (block.lines.length === 0
          ? ''
          : `<ul class="lines">${block.lines.map((line) => `<li>${inline(line)}</li>`).join('')}</ul>`) +
        (block.fix.length === 0
          ? ''
          : `<div class="fix">${block.fixLabel === undefined ? '' : `<h4>${esc(block.fixLabel)}</h4>`}${block.fix.map(simple).join('')}</div>`) +
        `</article>`
      )
  }
}

const CSS = (document: PdfDocument): string => {
  const rtl = document.lang === 'ar'
  const brand = document.brand?.color ?? DEFAULT_BRAND_COLOR
  const body = "'IBM Plex Sans Arabic','DM Sans',sans-serif"
  const latin = rtl ? body : "'DM Sans','IBM Plex Sans Arabic',sans-serif"
  return `
:root{--brand:${brand};--ink:#101828;--ink-2:#475467;--line:#d0d5dd;--soft:#f2f4f7}
*{box-sizing:border-box}
html{font-family:${latin};font-size:10.5pt;line-height:1.65;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
code,pre{font-family:'IBM Plex Mono','IBM Plex Sans Arabic',monospace;font-size:.88em}
code{unicode-bidi:isolate;background:var(--soft);border-radius:3px;padding:0 .25em;overflow-wrap:anywhere}
pre{background:var(--soft);border-radius:6px;padding:.6em .8em;white-space:pre-wrap;overflow-wrap:anywhere;margin:.5em 0;break-inside:avoid}
pre code{background:none;padding:0}
bdi{unicode-bidi:isolate}
@page{size:A4;margin:17mm 16mm 21mm;
  @bottom-center{content:counter(page) " ${cssString(document.footer.of)} " counter(pages);font-family:'DM Sans','IBM Plex Sans Arabic',sans-serif;font-size:8.5pt;color:#667085}
  @bottom-${rtl ? 'right' : 'left'}{content:"${cssString(document.footer.line)}";font-family:${body};font-size:8.5pt;color:#667085}}
@page cover{margin:0;@bottom-center{content:none}@bottom-left{content:none}@bottom-right{content:none}}
.cover{page:cover;height:297mm;break-after:page;display:flex;flex-direction:column}
.band{background:var(--brand);color:#fff;padding:14mm 16mm 10mm;display:flex;align-items:center;gap:5mm}
.band .logo{max-height:16mm;max-width:50mm;object-fit:contain;background:#fff;border-radius:3mm;padding:1.5mm}
.band .mark{font-family:${body};font-weight:700;font-size:20pt}
.band .credit{margin-inline-start:auto;font-size:8.5pt;opacity:.92}
.cover-body{padding:22mm 16mm 0;flex:1}
.kicker{margin:0 0 4mm;font-weight:600;color:var(--brand);font-size:12pt}
h1{margin:0 0 3mm;font-size:27pt;line-height:1.25;font-weight:700;overflow-wrap:anywhere}
.sub{margin:0;color:var(--ink-2);font-size:12pt}
.score{margin:14mm 0 10mm;display:flex;align-items:baseline;gap:4mm;border-block:1px solid var(--line);padding-block:6mm}
.score .num{font-family:'DM Sans',sans-serif;font-size:56pt;font-weight:700;line-height:1;color:var(--brand)}
.score .of{font-size:16pt;color:var(--ink-2)}
.score .text{margin-inline-start:6mm;display:flex;flex-direction:column}
.score .label{font-weight:600;font-size:12pt}
.score .note{color:var(--ink-2);font-size:10pt}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:2mm 8mm;margin:0}
.facts dt{color:var(--ink-2)}
.facts dd{margin:0;font-weight:600;overflow-wrap:anywhere}
h2{font-size:17pt;line-height:1.3;margin:0 0 3mm;padding-block-end:2mm;border-block-end:2px solid var(--brand);break-after:avoid}
main>section{margin-top:9mm}main>section:first-child{margin-top:0}
h3{margin:0;font-size:11.5pt;line-height:1.4;font-weight:600;overflow-wrap:anywhere}
h4{margin:0 0 1mm;font-size:10pt;color:var(--ink-2)}
p{margin:0 0 2.5mm}
ul,ol{margin:0 0 2.5mm;padding-inline-start:6mm}
li{margin-bottom:1mm;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin:0 0 4mm;font-size:9.5pt}
th,td{text-align:start;vertical-align:top;padding:1.8mm 2mm;border-block-end:1px solid var(--line);overflow-wrap:anywhere}
th{background:var(--soft);font-weight:600}
thead{display:table-header-group}
tr{break-inside:avoid}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 4mm}
.stat{border:1px solid var(--line);border-radius:3mm;padding:3mm;display:flex;flex-direction:column;break-inside:avoid}
.stat .value{font-family:'DM Sans',sans-serif;font-size:18pt;font-weight:700;line-height:1.2}
.stat .label{color:var(--ink-2);font-size:9pt}
.stat.good .value{color:#067647}.stat.bad .value{color:#b42318}
.issue{border:1px solid var(--line);border-inline-start-width:1.5mm;border-radius:3mm;padding:3mm 4mm;margin:0 0 3.5mm}
.issue header{display:flex;align-items:flex-start;gap:3mm;margin-bottom:1.5mm;break-after:avoid}
.chip{flex:none;border-radius:99px;padding:.3mm 2.6mm;font-size:8.5pt;font-weight:600;white-space:nowrap}
.meta{color:var(--ink-2);font-size:9pt;margin-bottom:1.5mm}
.lines{font-size:9.5pt}
.fix{margin-top:2mm;padding-top:2mm;border-top:1px dashed var(--line);font-size:9.5pt}
.critical{border-inline-start-color:#b42318}.critical .chip{background:#fee4e2;color:#912018}
.serious{border-inline-start-color:#c4320a}.serious .chip{background:#fdead7;color:#93370d}
.moderate{border-inline-start-color:#b54708}.moderate .chip{background:#fef0c7;color:#7a2e0e}
.minor{border-inline-start-color:#175cd3}.minor .chip{background:#d1e9ff;color:#194185}
.info{border-inline-start-color:#667085}.info .chip{background:var(--soft);color:#344054}
figure{margin:0 0 4mm;break-inside:avoid}
figure img{max-width:100%;max-height:120mm;border:1px solid var(--line);border-radius:2mm}
figcaption{color:var(--ink-2);font-size:9pt;margin-top:1mm}
`
}

/**
 * The page the PDF is drawn from: A4, right to left for Arabic and left to right for English, a
 * cover, then the sections. The fonts are the site's own, embedded; the page loads nothing and
 * runs nothing (its policy says so, and the renderer refuses every request). Every string is
 * escaped; there is no way for a field to carry markup.
 */
export function renderHtml(document: PdfDocument): string {
  const rtl = document.lang === 'ar'
  const { brand, cover } = document
  const logo =
    brand?.logo == null
      ? ''
      : `<img class="logo" alt="${esc(brand.name)}" src="data:${brand.logo.type};base64,${brand.logo.data}">`
  const mark = brand === null ? document.mark : brand.name
  const credit =
    brand !== null && brand.credit !== '' ? `<span class="credit">${esc(brand.credit)}</span>` : ''
  return (
    `<!doctype html><html lang="${document.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">` +
    `<title>${esc(document.title)}</title><style>${fontCss()}</style><style>${CSS(document)}</style></head><body>` +
    `<section class="cover" aria-label="${esc(cover.kicker)}"><div class="band">${logo}<span class="mark">${esc(mark)}</span>${credit}</div>` +
    `<div class="cover-body"><p class="kicker">${esc(cover.kicker)}</p><h1>${isolated(cover.heading)}</h1>` +
    `<p class="sub">${isolated(cover.sub)}</p>` +
    (cover.score === null
      ? ''
      : `<div class="score"><span class="num">${String(cover.score)}</span><span class="of">/ 100</span>` +
        `<span class="text"><span class="label">${esc(cover.scoreLabel)}</span><span class="note">${esc(cover.scoreNote)}</span></span></div>`) +
    `<dl class="facts">${cover.facts
      .map((fact) => `<dt>${esc(fact.label)}</dt><dd>${isolated(fact.value)}</dd>`)
      .join('')}</dl></div></section>` +
    `<main>${document.sections
      .map(
        (section) =>
          `<section><h2>${esc(section.heading)}</h2>${section.blocks.map(blockHtml).join('')}</section>`,
      )
      .join('')}</main></body></html>`
  )
}
