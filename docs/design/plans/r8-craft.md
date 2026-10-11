# R8: the craft pass

On 2026-10-11 the owner said of the site: «بدي تحسن التصميم كليًا ومابدي اي ai slop» (improve the
design completely, and no AI slop). Five agents had built the home, tool, report, knowledge, blog,
compare and account pages on the same tokens (M2.6 R7, M4, M6); R8 is one designer's pass over all
of them. It adds no page and no effect: it makes the pages agree, takes out what reads as
templated, and makes the five things that are Arablyzer's own crisper. The rules of M2.6 §8 (R7)
still bind: the phone scale, gradients only in the home hero, two columns on a desktop's inner
pages, the budgets.

The screenshots, before and after, at 390 px (device scale 2, the first screen and the whole page)
and 1440 px (the whole page), are in the session's scratchpad: `r8-shots/before` and
`r8-shots/after` (the same file names, `<page>-m-first.png`, `<page>-m-full.png`,
`<page>-d-full.png`), and `r8-shots/{before,after}/s/` for each page cut into screens. They are not
in the repository.

## 1. What «no slop» meant here

The owner's taste is a lively SaaS (colour, motion, a product shot), and R7 made it disciplined. A
tell is a pattern that appears because a template has it, not because the page needs it. What was
found and what was done:

| Tell | Where it was | What it is now |
| --- | --- | --- |
| A pill above every section heading, headings centred | home sections, fix guides, compare, articles | no pill (`kick` is for a state, «قريباً»); a section's heading and lead start the line (`section-head`); a page's topic is a dot and a name (`topic`) |
| A sparkle on a gradient pill at the top of the hero | home hero | the count in bold, an arrow, one white pill |
| Icons on gradient squares | the bento's seven tiles, the FAQ's «+» square, the tool page's «+» squares | the bento's tile wears its tool's category: a dot in the directory's colour and its name; accordions a bare chevron |
| Rows of identical rounded cards | the home counts (five), the home plans (three), the FAQ (four), the hub's directories (four), the tool page's sections, the account (seven) | one ledger (`ledger`: hairlines, not boxes) for figures; plans as one card and two plain entries; questions as one list; the tool page's checks and fix on the ground; the account in two columns |
| A faint teal wash behind every inner page's head | all inner pages | a white band with a hairline (`PageBand`); the aurora is the hero's alone |
| A gradient edge on the free plan, gradient numbers on the steps | plans, how it works | a solid brand edge; outlined numerals (the one sequence on the site keeps its numbers) |
| «·» between facts | the report's line under the address, the article byline, the rule's facts, the account's rows, the footer, five report cards | a gap (`meta-row`); a comma or a sentence where it was prose («فشلت 3 قواعد، ونجحت 26 قاعدة») |
| A drawn box inside a drawn box | the account's sites, alerts, webhook | rows with hairlines |
| A centred 404 with a big number | the 404 page | a drawing of the site's own: a page of lines the reading beam sweeps, one of them missing |
| Different empty boxes | tools, rules, knowledge search, saved sites | one `empty-state` with the same drawing |
| Weight 700 on the wordmark | header, footer, a report's brand bar | semibold: the site loads 400 and 600 |

## 2. The drift fixed

- **Heads.** Four pages drew the same band by hand (`PageHead`, `DocPage`, `ToolPage`, `RulePage`);
  they are `PageBand`. Fix guides and the fix index no longer have a pill.
- **Engines.** The home box, the bento and a report named the three browsers with three sets of
  colours (WebKit was sky blue on the home page and dark cyan in a report; Firefox two oranges).
  One token each (`--color-engine-*`), one list (`lib/engines.ts`), one pill (`engine-chip`).
- **Rhythm.** Half steps (10, 14, 6 px: `gap-2.5`, `py-3.5`, `gap-1.5`) are on the 4 px grid
  everywhere in the pages and islands, and so are the chips (16 px), the buttons (20 px), the list
  links (8 px) and the kicker (32 px).
- **Hover.** A chip no longer jumps; a bento tile and a comparison card rise 2 px (it was 4); a list
  row, a tool row and an FAQ row all go to the ground colour.
- **Headings in the account.** One page had `heading-1`, three `heading-2`, two `heading-3` and
  three sizes of icon: every section is `heading-2`, none has an icon.
- **Copy.** «عرض الكل / اعرض أقل» (a noun, then a verb) are verbs; the sites' lead is a sentence
  that says what to do. All new strings are `reviewed: false`.
- **Dead code.** `CategoryIcon.astro` (R7 left it with no page) and the `kicker` strings of the home
  page are gone.

## 3. The signatures

Each stays singular; none is new.

- **The scan ring** is the home box's alone (the shared test still fails if another page draws it).
- **The reading beam** runs right to left in a scan's progress, along the three steps' line, and now
  over the 404's page of lines. Under reduced motion it is not drawn, as before.
- **The Arabic X-ray circles** keep their width on the screen (`vector-effect:
  non-scaling-stroke`, 3 px over a 6 px white ring): a desktop's shot, drawn small, is circled as
  clearly as a phone's.
- **The per-engine chips** are one component's worth of style (above).
- **The bento** has a colour for each category, and says so: it is the directory's legend.
- **The dark band** lost its pill and keeps its «قريباً»; **the count-up** is on figures with
  tabular digits, laid out as a ledger.

## 4. Page by page

- **Home.** Section heads at the start of the line, no pills. Counts as a ledger. Bento tiles with a
  category dot and name (the first tile's pale wash is gone). Steps as outlined numerals, at the
  start of the line, the beam along their line. Plans: the free plan is the card (solid edge), the
  two paid ones two plain entries (a hairline between, «قريباً»). The FAQ is one list beside its
  heading from lg. The closing band has its words at the start and the button across. The section
  placeholders (`contain-intrinsic-size`) were re-measured.
- **Tools index, tool page, generators.** The tool page's «what it checks» and «the fix» sit on the
  ground, not in boxes; the questions are one list with a chevron; a rule's row is aligned on the
  text's baseline. The index's empty state is the shared one.
- **Report.** The line under the address is a `meta-row`; the engines, the benchmark, the PDF facts
  and the country card lose their «·»; the engine pill is shared; the X-ray's circles are crisper.
- **Knowledge hub, rules, guides, glossary, bot, methodology.** The hub's four directories are a
  ledger; the rule page's facts are a `meta-row`; the fix pages' source is a `topic`.
- **Blog.** The index sets its newest article apart (the size of a section heading, no box) above
  the list; every row says its first topic (a dot in the topic's colour), its date and its reading
  time. The article is a 680 px reading column, the contents and the pages it is about at the far
  edge: 16 px on a phone and 18 from lg, ink and not ink-2, leading 1.85 (Arabic 2). It has a
  pull-quote (strict Markdown reads «> a sentence», one paragraph; two articles use it), a code block
  with an inset edge, a caption style, a line and a button to the scan at the end, and a pager that
  is two cells with a hairline.
- **Compare.** The table is a card; our column is on a teal tint, the competitor's cells say
  «نعم / جزئياً / لا / غير مذكور» in a disc of the meaning's colour as well as in words. Below md
  each row is still a card with its two cells labelled. The index is a grid of four.
- **Account, crawl report, PDF and brand settings.** Two columns from lg: the details card (address,
  name, language, sign out) sticks beside the sections; the sections share one heading size and
  have no box inside a box. External-link, sign-out and send icons mirror in a right-to-left page.
- **404.** A page of lines with one missing and the reading beam over it; the search and four ways
  on, at the start of the line.

## 5. New names

In `apps/web/src/styles/global.css`, each with its comment: `meta-row`, `topic`, `section-head`,
`ledger` and `ledger-cell`, `empty-state`, `engine-chip`, `page-columns-reading` and the
`.prose-article` rules (also `PageColumns`' `reading` prop); `--color-engine-*`. Components:
`PageBand.astro`, `blog/PostMeta.astro`. `packages/seo`'s Markdown reads one-paragraph block quotes.

## 6. Page heights (Arabic, the whole page, px)

| Page | 390 px before | 390 px after | 1440 px before | 1440 px after |
| --- | --- | --- | --- | --- |
| Home | 5,722 | 5,426 | 5,586 | 5,284 |
| Tools index | 7,243 | 7,251 | 6,689 | 6,701 |
| A URL tool (`rtl-check`) | 3,477 | 3,340 | 2,766 | 2,643 |
| A generator (`schema-generator`) | 4,667 | 4,506 | 3,890 | 3,722 |
| The report (golden 04) | 5,549 | 5,561 | 4,463 | 4,479 |
| Knowledge hub | 3,423 | 3,470 | 3,569 | 3,611 |
| A rule | 3,119 | 3,143 | 2,095 | 2,107 |
| A fix guide | 4,181 | 4,185 | 3,131 | 3,132 |
| A glossary term | 3,086 | 3,106 | 2,207 | 2,219 |
| Rule library | 9,552 | 9,718 | 6,739 | 6,751 |
| Fix guides index | 2,389 | 2,416 | 2,056 | 2,087 |
| Glossary | 3,991 | 4,075 | 4,551 | 4,639 |
| Bot page | 4,218 | 4,232 | 3,018 | 3,030 |
| Methodology | 7,530 | 7,544 | 4,563 | 4,575 |
| Blog index | 2,243 | 2,321 | 1,740 | 1,816 |
| An article | 7,218 | 8,172 | 4,681 | 5,924 |
| A blog tag | 1,584 | 1,568 | 1,233 | 1,265 |
| Compare index | 1,323 | 1,563 | 1,165 | 1,173 |
| Compare: Shipwork | 4,300 | 4,635 | 2,435 | 2,805 |
| 404 | 1,105 | 1,193 | 973 | 909 |
| Account (signed in) | 4,578 | 4,526 | 3,853 | 3,458 |
| Account with a crawl report open | 7,362 | 7,311 | 6,383 | 6,018 |
| Compare two reports | 2,433 | 2,441 | 2,127 | 2,139 |
| Sign in | 1,150 | 1,158 | 971 | 983 |

The home page on a phone stays under the 7,000 px R7 set (5,426). The article is taller on a phone and a desktop because its type is larger (16 to 18 px, leading 1.85 to 2) and its sections are a reading rhythm apart. The account is shorter on a desktop (two columns) and about the same on a phone. The sign-in and account rows are the accounts build; the normal build says accounts are off.

## 7. Where R8 departs from what was asked, and what it left

- **The pull-quote needed a Markdown feature**, not only a style: `> a sentence` is now one
  paragraph in a `<blockquote>` (`packages/seo/src/markdown.ts`; a test replaces the one that said
  quotes throw). A figure and its caption have no Markdown, so `figcaption` has a style and no
  article uses one yet.
- **The blog article's measure is 680 px**, not a count of characters: about 65 Latin characters at
  18 px, 40 to 45 Arabic words a line.
- **The hero's aurora, grid and ring are untouched**: they are the identity. The closing band keeps
  its gradient and field of dots (it is the home page's).
- **Not done:** a dark theme (the owner asked for one in M2.6; it is a token redeclaration and its
  own milestone), the glossary and rule pages' prose is still `text-ink-2` at 16 px (the article's
  larger, darker type is the blog's), `en/ai-visibility`'s phone lead wraps to three lines on this
  Mac (it did before R8: the tool-page test is the CI's to run), and no real crawl report could be
  screenshotted outside a mocked API.
- **Account screenshots** use the accounts build (`PUBLIC_AUTH_GOOGLE_CLIENT_ID`) and fixed API
  answers, as `account.browser.test.ts` does.

## 8. Checks

From the worktree root, on the branch `design/r8-identity`.

- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` (25 tasks; the web app's `astro check`: 0
  errors) are clean.
- Unit tests: the web app's 382 (34 files), `@arablyzer/i18n`'s 50 (the tally strings changed:
  «فشلت 3 قواعد، ونجحت 18 قاعدة»), `@arablyzer/seo`'s 202 (a block-quote test replaces the one that
  said quotes throw).
- `pnpm build`: 426 pages and 418 Open Graph images. `pnpm site:audit`: 426 pages, no problems.
- The web app's browser tests, all three engines on this Mac (WebKit's loopback self-scan is the
  repository's own skip on macOS): 1,239 passed, 19 skipped and 1 failed twice, the same one before
  and after R8: «a lead of one or two lines on a phone», `en/ai-visibility`, which wraps to three
  lines at 358 px on macOS Chromium (measured on the build from before R8 too: 76.8 px of 25.6 px
  lines). Tests changed for the new design: the home FAQ's focus ring (inside the row, since the
  list clips), the 404 page (a heading, a search, four ways on, beside one drawing). One run had
  two «hook timed out» in `afterAll` under load; they passed on the next.
- **Lighthouse**, CI's own script with one run on each of the 32 representative pages, phone and
  desktop: accessibility, best practices and SEO 100 everywhere; performance 99 or 100 on all but
  three phone pages (`/knowledge` 98, `/en/` 97, and `/` 89 in that one run). A scratch script with
  three runs and CI's gzip on `/` gave 98, 98, 98 (the 89 was a single run's speed index); before
  R8, 98, 98, 98. The article, the comparison, a tool and the hub, three runs each: 100, 100, 99
  (96 in one of three), 98.
- **No sideways scroll** at 320, 360 and 390 px, and the contrast of every page's text: the browser
  tests above (the 404 page's grid needed `minmax(0, 1fr)` to hold at 320 px).
- **Screenshots**: 25 page kinds at 390 px (device scale 2, the first screen and the whole page) and
  1440 px, before and after: `r8-shots/before`, `r8-shots/after`, in the session's scratchpad.
