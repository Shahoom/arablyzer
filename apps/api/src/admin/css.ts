/**
 * The panel's one stylesheet (M4.8), served by the API itself at /admin/assets/admin.css, behind
 * the same guard as every page: the panel's look is not public either. The values are the site's
 * tokens (apps/web/src/styles/global.css), written out because the panel is not an Astro page; the
 * dark scheme follows the browser's. Logical properties throughout, so the page is right in both
 * directions. No script anywhere and no `style=""`: this file is the only styling there is.
 */
export const ADMIN_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f8fb; --surface: #ffffff; --surface-2: #f1f5f9;
  --line: #e3e8ef; --line-2: #cdd5df; --field: #8491a3;
  --ink: #0b1b2b; --ink-2: #475467; --ink-3: #667085;
  --brand: #007d88; --brand-ink: #005f68; --brand-soft: #e0f2f3;
  --indigo: #4f46e5; --indigo-soft: #eef0ff; --indigo-ink: #3730a3;
  --critical: #e11d48; --critical-ink: #be123c; --critical-soft: #ffe4e8;
  --moderate-ink: #b45309; --moderate-soft: #fef3dd;
  --pass: #047857; --pass-soft: #e7f6ef;
  --grad-btn: linear-gradient(120deg, #00727c 0%, #4f46e5 100%);
  --grad-band: linear-gradient(120deg, #00727c 0%, #3b48d6 55%, #7c3aed 100%);
  --radius: 12px; --radius-s: 8px;
  --shadow: 0 1px 2px rgba(11, 27, 43, 0.06), 0 4px 14px rgba(11, 27, 43, 0.05);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a1628; --surface: #0f2038; --surface-2: #14294a;
    --line: #1f3355; --line-2: #2c4570; --field: #6f84a3;
    --ink: #e8eef6; --ink-2: #b4c0d0; --ink-3: #93a4ba;
    --brand: #3cc4cf; --brand-ink: #7ddde5; --brand-soft: #0d3a46;
    --indigo: #8b86ff; --indigo-soft: #1d2a5e; --indigo-ink: #b6b3ff;
    --critical: #fb7185; --critical-ink: #fda4af; --critical-soft: #4a1523;
    --moderate-ink: #fbbf24; --moderate-soft: #3d2a08;
    --pass: #34d399; --pass-soft: #0b3a2c;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.3);
  }
}
* { box-sizing: border-box; }
html { font-size: 15px; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif;
  line-height: 1.55; min-block-size: 100vh;
}
a { color: var(--brand-ink); text-underline-offset: 3px; }
a:hover { color: var(--indigo-ink); }
:focus-visible { outline: 3px solid var(--indigo); outline-offset: 2px; border-radius: 4px; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; line-height: 1.3; }
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; line-height: 1.35; }
p { margin: 0 0 0.75rem; }
code, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em; }
.ltr { direction: ltr; unicode-bidi: isolate; }
.muted { color: var(--ink-2); }
.small { font-size: 0.86rem; }

.top {
  display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1.25rem;
  background: var(--surface); border-block-end: 1px solid var(--line);
  position: sticky; inset-block-start: 0; z-index: 5;
}
.brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; color: var(--ink); text-decoration: none; }
.mark { inline-size: 1.7rem; block-size: 1.7rem; border-radius: 8px; background: var(--grad-btn); display: inline-block; }
.top .who { margin-inline-start: auto; display: flex; align-items: center; gap: 1rem; font-size: 0.86rem; color: var(--ink-2); }
.shell { display: grid; grid-template-columns: 13.5rem minmax(0, 1fr); gap: 1.5rem; padding: 1.25rem; max-inline-size: 90rem; margin-inline: auto; }
.nav { display: flex; flex-direction: column; gap: 0.25rem; align-self: start; position: sticky; inset-block-start: 4.2rem; }
.nav a {
  display: block; padding: 0.55rem 0.8rem; border-radius: var(--radius-s); color: var(--ink-2);
  text-decoration: none; font-weight: 600;
}
.nav a:hover { background: var(--surface); color: var(--ink); }
.nav a[aria-current="page"] { background: var(--brand-soft); color: var(--brand-ink); }
main { min-inline-size: 0; }
@media (max-width: 52rem) {
  .shell { grid-template-columns: minmax(0, 1fr); padding: 1rem; }
  .nav { flex-direction: row; flex-wrap: wrap; position: static; }
  .top { padding-inline: 1rem; flex-wrap: wrap; }
}

.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 1rem 1.15rem; box-shadow: var(--shadow); margin-block-end: 1.25rem;
}
.card > h2:first-child { margin-block-start: 0; }
.grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); margin-block-end: 1.25rem; }
.grid.two { grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
.stat {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 0.85rem 1rem; box-shadow: var(--shadow);
}
.stat .label { color: var(--ink-2); font-size: 0.84rem; font-weight: 600; }
.stat .value { font-size: 1.7rem; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
.stat .sub { color: var(--ink-3); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.stat.hot { border-color: var(--critical); }

table { inline-size: 100%; border-collapse: collapse; font-size: 0.9rem; }
.tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); margin-block-end: 1rem; }
th, td { padding: 0.5rem 0.75rem; text-align: start; border-block-end: 1px solid var(--line); vertical-align: middle; }
th { background: var(--surface-2); color: var(--ink-2); font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
tbody tr:last-child td { border-block-end: 0; }
tbody tr:hover td { background: var(--surface-2); }
td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; }
td.url { max-inline-size: 22rem; overflow-wrap: anywhere; direction: ltr; text-align: start; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1.25rem; margin: 0; }
dl.facts dt { color: var(--ink-2); font-weight: 600; }
dl.facts dd { margin: 0; overflow-wrap: anywhere; }

.chip {
  display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700;
  background: var(--surface-2); color: var(--ink-2); white-space: nowrap;
}
.chip.ok { background: var(--pass-soft); color: var(--pass); }
.chip.warn { background: var(--moderate-soft); color: var(--moderate-ink); }
.chip.bad { background: var(--critical-soft); color: var(--critical-ink); }
.chip.info { background: var(--indigo-soft); color: var(--indigo-ink); }

.btn, button {
  font: inherit; font-weight: 700; cursor: pointer; border-radius: var(--radius-s);
  border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); padding: 0.45rem 0.9rem;
  text-decoration: none; display: inline-block; line-height: 1.4;
}
.btn:hover, button:hover { background: var(--surface-2); }
.btn.primary, button.primary { background: var(--grad-btn); color: #fff; border-color: transparent; }
.btn.danger, button.danger { background: var(--critical); color: #fff; border-color: transparent; }
.btn.small, button.small { padding: 0.25rem 0.6rem; font-size: 0.84rem; }
details.act { margin-block-end: 0.5rem; }
details.act > summary {
  list-style: none; cursor: pointer; display: inline-block; font-weight: 700; border-radius: var(--radius-s);
  border: 1px solid var(--line-2); background: var(--surface); padding: 0.45rem 0.9rem;
}
details.act > summary::-webkit-details-marker { display: none; }
details.act[open] > summary { background: var(--surface-2); }
details.act.danger > summary { color: var(--critical-ink); border-color: var(--critical); }
details.act form {
  margin-block-start: 0.6rem; padding: 0.8rem 1rem; border: 1px dashed var(--line-2);
  border-radius: var(--radius-s); background: var(--surface-2); max-inline-size: 38rem;
}
details.act.small { display: inline-block; margin: 0; }
details.act.small > summary { padding: 0.2rem 0.6rem; font-size: 0.84rem; }
label { display: block; font-weight: 600; font-size: 0.88rem; margin-block-end: 0.2rem; }
input[type="text"], input[type="search"], input[type="number"], select {
  font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--field);
  border-radius: var(--radius-s); padding: 0.4rem 0.6rem; min-inline-size: 0;
}
input[type="number"] { inline-size: 9rem; direction: ltr; text-align: start; }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; margin-block-end: 0.8rem; }
.bar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: end; margin-block-end: 1rem; }
.bar input[type="search"], .bar input[type="text"] { inline-size: min(22rem, 100%); }
.pager { display: flex; gap: 0.75rem; align-items: center; justify-content: center; margin-block: 1rem; color: var(--ink-2); }
.pager .off { opacity: 0.45; pointer-events: none; }
.flash { padding: 0.6rem 0.9rem; border-radius: var(--radius-s); margin-block-end: 1rem; font-weight: 600; }
.flash.ok { background: var(--pass-soft); color: var(--pass); }
.flash.bad { background: var(--critical-soft); color: var(--critical-ink); }
meter { inline-size: 8rem; block-size: 0.7rem; vertical-align: middle; }

.spark { display: block; inline-size: 100%; block-size: 3.2rem; }
.spark .a { fill: none; stroke: var(--brand); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.spark .b { fill: none; stroke: var(--indigo); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.spark .area { fill: var(--brand-soft); stroke: none; opacity: 0.8; }
.spark .base { stroke: var(--line-2); stroke-width: 1; }
.legend { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--ink-2); }
.legend i { display: inline-block; inline-size: 0.7rem; block-size: 0.7rem; border-radius: 3px; margin-inline-end: 0.3rem; vertical-align: -1px; }
.legend i.a { background: var(--brand); }
.legend i.b { background: var(--indigo); }
.health { display: grid; gap: 0.6rem; }
.health div { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.health strong { min-inline-size: 7.5rem; }
.center { max-inline-size: 30rem; margin: 6rem auto; text-align: center; }
@media (prefers-reduced-motion: no-preference) {
  .btn, button, .nav a { transition: background-color 0.15s ease, color 0.15s ease; }
}
`
