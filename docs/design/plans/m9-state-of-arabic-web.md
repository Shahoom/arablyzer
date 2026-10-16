# M9 «حالة الويب العربي» (State of the Arabic Web), Implementation Plan

> **ملخص للمالك:** المرحلة 9: تقرير سنوي بأرقام حقيقية عن الصفحات الرئيسية لأشهر المواقع على نطاقات الدول العربية (السعودية، الإمارات، مصر، الكويت، قطر…)، من قائمة Tranco العامة. نفحص الصفحة الرئيسية فقط، بمتصفح واحد (Chromium)، ونحترم robots.txt (بما فيه مجموعة `*` وأي منع لـ ArablyzerBot)، ولا نخزّن لقطات ولا نصوصاً، وننشر **مجاميع فقط** بلا أسماء مواقع ولا صفوف مواقع (حتى بمعرّف مشفّر). نستبعد من العيّنة روابط الاختصار على النطاقات التي تُباع للعالم (`bit.ly`) وفروع الشركات العالمية (`google.iq`)، والأرقام الرئيسية للصفحات العربية وحدها، وحصة الصفحات غير العربية رقم مستقل. الزحف يعمل بأولوية أدنى من أي زائر: لا يبدأ فحصاً ما دام هناك فحص زائر في الطابور أو قيد العمل أو السيرفر مشغولاً، وبمعدل أقصاه فحص كل 20 ثانية. الموقع يعرض المنهجية و«الإصدار الأول قريباً» حتى تتوفر نتائج حقيقية، ولا أرقام مختلقة أبداً. **المطلوب منك:** تشغيل الزحف على السيرفر (أوامر في وصف الطلب)، ومراجعة النصوص العربية (`reviewed: false`)، وقرارات في آخر الخطة.

**Goal:** One edition of a yearly report: how the homepages of the most popular sites on Arab country domains do on what Arablyzer measures (Arabic rendering, direction and language, machine readability, mobile, speed, security, structured data, platform), as aggregates with confidence intervals, a page that shows them, and a dataset (Parquet, CSV, JSON, JSON Schema, `Dataset` markup) under CC BY 4.0.

Source: BUILD-PLAN §5.14 and issue #42. The owner approved the bulk crawl on 2026-10-16 on one condition: it must not eat the server's capacity. This plan is that condition made into rules the code enforces and the tests check.

## 0. Measured before planning (2026-10-16)

| Question | Result |
|---|---|
| Is there a crawler to reuse? | The deep crawl (M4.5) reads a saved site's pages through the scanner's `/crawl` route, which fetches under the egress rules and honours robots.txt as a crawler (RFC 9309: the `*` group counts, a file that cannot be read keeps the crawler out). `remoteCrawler.page(url, {anyOrigin: true})` is exactly the front-page read this needs. |
| How is a scan queued below visitors? | `BullMQScanQueue` is one queue with one worker taking one job at a time. BullMQ takes a job with a `priority` only when no job without one waits (`moveToActive`: the wait list first, the prioritised set when it is empty), and `getWaitingCount()` counts the wait list alone, so a prioritised job is invisible to the API's queue limit. The scan job already takes `engines` (M5.1). |
| Where is the report kept? | A scan is a row in `scans` with its report. The crawl makes an unlinked scan (no account, so no quota counts it), reads the report when the worker finishes it, keeps a compact outcome, and deletes the scan with its report. Nothing of a page is kept. |
| Tranco | `https://tranco-list.eu/download/<list id>/1000000` is `rank,domain` for the top million, pay-level domains; a list id is permanent (2026-10-01's is `Y83YG`). |
| Parquet | `hyparquet-writer` 0.16.11 (MIT, one dependency: `hyparquet` 1.31.3) writes and reads back in pure JavaScript, both older than the repository's one-week rule (`minimumReleaseAge`). |

## Global Constraints

- **Homepages only.** One address for each site (`https://<domain>/`, then `http://`, then `https://www.`): no link is followed, no form submitted, no CAPTCHA or bot protection bypassed. A bot challenge or an error page is a site not judged.
- **robots.txt is honoured as a crawler's** (RFC 9309): a `Disallow` for `ArablyzerBot` or for `*` keeps the site out; a robots.txt that cannot be read (a 5xx or a timeout) keeps it out too. The scan itself reads robots.txt again and honours a group naming ArablyzerBot.
- **Identified.** Every request carries ArablyzerBot's user agent and links to `/bot`, which says how to opt out.
- **Opt-out.** A site's owner writes to `optout@arablyzer.com` (the address is the owner's to create: an owner need) or adds `Disallow` for ArablyzerBot; a domain listed in `packages/sotaw/data/opt-out.txt` is left out of every frame and skipped by the crawl.
- **Aggregates only in public outputs.** The site, the aggregates and every file under `apps/web/public/data/state-of-arabic-web/<edition>/` name no site and hold no row that is one, not even under a hash. The only public file with site names is the sample frame (a list of domains with rank and country, and the exclusions with their reasons, all before any measurement), published ahead of the crawl so that the sample can be checked. The per-site table (`sites.parquet`: a keyed id, an HMAC of the domain under a secret that is never published, and the metrics) is made only by `pnpm sotaw export --internal DIR` for our own analysis; the CLI refuses a `public` folder for it, the edition's manifest and schema do not mention it, and the web build refuses an edition folder that holds any file the manifest does not list or any `sites*` file.
- **No cell smaller than 30 sites** is published (country, platform, or both): a number must not point at a few sites. A country below it is `other` in the internal per-site rows.
- **The figures are of Arabic pages.** Every figure of the report except the funnel and the share of pages not in Arabic is of the homepages judged that are in Arabic: the language they declare is `ar` (or one of its varieties `arb`, `arz`, `ary`, `ars`, `arq`; not `arn` or `arg`, which start with the same letters) or their dominant script is Arabic (`isArabicPage`, `packages/sotaw/src/outcome.ts`). The pages on Arab domains that are not in Arabic are counted separately (`funnel.notArabic`) and their weighted share is its own figure (`notArabic`, with its interval): «pages on Arab domains that are not in Arabic: N%». They are in no other share, cell, platform count or denominator.
- **Capacity.** One scan at a time (`ARABLYZER_SOTAW_CONCURRENCY`, 1), at most one launch every 20 seconds (`ARABLYZER_SOTAW_INTERVAL_SECONDS`), lowest priority, and nothing launched while a visitor's scan waits or runs (`busy()`), while the host's one-minute load per core is over `ARABLYZER_SOTAW_MAX_LOAD` (0.5), or before the pause is over. It never counts against a visitor's or an account's quota: it makes unlinked scans straight in the queue, as the monitor does, and goes through no API route.
- **Chromium only** by default (`ARABLYZER_SOTAW_ENGINES`); `ARABLYZER_SOTAW_ALL_ENGINES_SHARE` draws a share of the sites, chosen by the seeded hash, in all three.
- **Resumable.** State is in PostgreSQL (`sotaw_runs`, `sotaw_results`); a stop (SIGTERM, a crash, a restart) loses at most the scan in hand, which is picked up from its scan id when the crawl is started again with the same command. A run goes on only with the same frame (its SHA-256).
- **No invented numbers.** The page shows the methodology and «الإصدار الأول قريباً» until an edition's `aggregates.json` is committed; it never shows a figure that is not in it.
- UI on the R7/R8 scale (`wrap`, `heading-2/3`, `text-body/small/meta`, `ledger`, `section-head`, `card p-card rounded-card`, 44 px targets, logical properties, no `style=` (CSP), no letter-spacing on Arabic); charts are inline SVG with text alternatives; every new string `reviewed: false`.

## 1. What is measured

Every figure is a share of the homepages judged for it (a rule that does not apply, or did not run, leaves the page out of that figure's denominator). Each is the result of rules of the engine, so the same page gives the same result.

| Metric (id) | From |
|---|---|
| Letters pulled apart (`shaping`) | `ar-letter-spacing`: letter-spacing on Arabic text breaks the joining of letters. It is the cause of broken shaping the engine detects with certainty in one browser; a font's own shaping bugs are not measured here |
| Arabic font problems (`arabic-font`) | `ar-font-no-arabic`, `ar-font-missing-letters`, `ar-font-fallback` |
| Mixed digit systems (`mixed-digits`) | `ar-digits-mixed` |
| New riyal sign used / its glyph missing (`sar-sign-used`, `sar-sign-glyph`) | `sar-sign-font`: of the pages that use U+20C1, those whose font lacks it |
| RTL or language declaration wrong (`rtl-lang`) | `rtl-html-dir`, `ar-html-lang` (Arabic pages) |
| Machine-reading obstacles (`ai-readability`, `ai-blocked`) | `ar-ai-readability`, `js-only-content`; `robots-blocks-ai-search` |
| Mobile (`mobile-overflow`, `no-viewport`) | `rtl-horizontal-overflow` (RTL pages, a phone-width viewport); `viewport-missing` |
| Core Web Vitals (`lcp`, `inp`, `cls`, `crux-data`) | the Chrome UX Report, phone, 75th percentile, when the scanner has a CrUX key and the origin has data; good / needs improvement / poor by web.dev's thresholds. No lab numbers: they vary from run to run |
| Security (`no-https`, `no-hsts`, `no-csp`, `no-nosniff`, `no-frame-protection`, `no-referrer-policy`, `headers`) | the rules of the same names; `headers` is how many of the five headers a page sends |
| Structured data (`json-ld`, `json-ld-broken`) | JSON-LD present; of those, with a syntax error |
| Score (`score`) | Arablyzer's score in tens |
| Platform | `platform-detected`'s primary technology (Salla, Zid, WordPress, Shopify…), named when 30 or more pages share it, `other`, or `none` |

All of these are of the Arabic pages (see the global constraint above); there is no metric «is the page Arabic»: that is the split itself, and its one figure is the share of pages not in Arabic (§4).

`packages/sotaw/src/metrics.ts` is the one list; the page, the dataset's columns and the JSON Schema are read from it.

## 2. The sample frame

- **Source:** the Tranco list, a pinned list id (recorded in the frame's file), through `safeFetch` (the egress rules; `ARABLYZER_EGRESS_PROXY` when set). Domains whose last label is one of the 19 Arab ccTLDs: `.sa .ae .eg .kw .qa .bh .om .jo .ma .dz .tn .iq .lb .ly .sy .ye .sd .ps .mr`. `example.sa.com` is not `.sa`; `shop.com.sa` is.
- **Exclusions, before sampling** (`packages/sotaw/src/exclusions.ts`, the whole rule; each site left out and its reason is in `data/frames/<list id>.exclusions.csv`): a ccTLD is not always the country's web. (1) `.ly`: only names under the second-level public suffixes `gov.ly com.ly edu.ly org.ly net.ly sch.ly plc.ly med.ly id.ly` are kept; every single-label `x.ly` (`bit.ly`, `cutt.ly`, `musical.ly`…) is dropped (`ly-single-label`). (2) Named domain hacks on the other ccTLDs, one by one (`vanity-domain`): `lu.ma`, `cre.ma`; a shape rule would also drop `avito.ma`. (3) Mirrors of global brands on any country domain, or under `com`/`co`/`net`/`org` there (`global-brand`): google, youtube, facebook, instagram, amazon, microsoft, apple, wikipedia, yahoo, bing, twitter, x, tiktok, linkedin, whatsapp, netflix, booking. A brand's name inside another name (`googleads.sa`) is not a mirror. Opt-outs are applied after. The countries' populations that weight the report are counted after the exclusions.
- **Sampling:** up to 10,000. **List `Y83YG` (2026-10-01) has 3,767 sites on these domains; 179 are left out (136 `ly-single-label`, 41 `global-brand`: 21 youtube, 17 google, 3 amazon; 2 `vanity-domain`), so its frame is the other 3,588** (no sampling; the sampler is built, tested and used when a list has more). `.ly` falls from 158 to 19 sites (all under `gov.ly`, `edu.ly`, `com.ly`, `sch.ly`). When the list has more, each country gets its floor (300, or all it has) and the rest is shared by what each has left (largest remainder); inside a country the sites with the smallest `SHA-256(seed, domain)` are taken, so the choice is random with respect to rank, the same on any machine, and independent of the order of the file. `seed` and `floor` are in the frame's metadata.
- **Files:** `packages/sotaw/data/frames/<list id>.csv` (`domain,rank,country`, nothing else), `<list id>.exclusions.csv` (`domain,rank,country,reason`) and `<list id>.json` (list id and date, seed, cap, floor, the population and the sample of each country, the number of exclusions and their SHA-256, SHA-256 of the CSV). `pnpm sotaw:frame --list-id <id>` writes all three and needs no database. `pnpm sotaw:frame --from-frame <id>` makes the same frame again under the current rules from the frame as committed, without the download, when that frame holds every site (no country was sampled); a test checks that the committed files are exactly what the code's rules make of themselves.
- **Crawl order:** a second seeded shuffle, so that a crawl stopped half-way is a random half of the frame, not the top of the list.
- **A country domain is not the country's audience.** The exclusions above remove what is known: `.ly`'s link shorteners (`bit.ly`, rank 118 in `Y83YG`), two named hacks and the 17 brands' mirrors (`google.iq`, `amazon.eg`). What remains can still be a global company's local site (`ubuy.ae`, `nike.sa`, `wego.qa`), or a typing-mistake domain (`.om` for `.com`); those that are not in Arabic are caught by the Arabic-pages rule (§4), those that are, are Arabic sites. The `.ly` rule is deliberately blunt: it also drops real Libyan sites that registered a single name directly under `.ly` (an operator, a newspaper) among the 136 single names in `Y83YG`; Libya is left with 19 sites, below the smallest cell, so it is not a country row of the report. The frame is published before the crawl so that the owner can read it; a site can be removed through `opt-out.txt`.
- **Not covered, and said so on the page:** sites on `.com`, `.net`, `.org` and other generic domains whose content is Arabic (a later edition may add them, from Common Crawl's language data or the list's own hints; the frame's format already allows a second source); the Arab countries' internationalised domains (`.السعودية`); sites outside the top million; everything behind a login; every page that is not the homepage.

## 3. The crawl

`pnpm sotaw:crawl` (the CLI in `packages/sotaw/src/cli.ts`), run inside the stack's network as the `sotaw` compose service (profile `sotaw`, the API image, the application role). For each site in the crawl's order:

1. **Gate.** Wait while `busy()` (visitors' scans waiting or running, less the crawl's own that is running) is above 0 or the host's load per core is above the limit; poll every 5 s.
2. **Take** the next pending site (`UPDATE … FOR UPDATE SKIP LOCKED`); one crawl at a time is held by an advisory lock.
3. **Read the front page** through the scanner (`/crawl`, no browser): robots.txt as a crawler, then the page, `https://`, then `http://`, then `https://www.`; at least 2 s between two reads (what robots.txt's answer means, below). Skipped, with a reason code and no scan: `robots`, `robots-unreachable`, `bot-challenge`, `http-error` (the site answered with an error status), `unreachable`, `not-html`, `off-domain` (the front page ended on another domain), `opt-out`.
   **robots.txt, as RFC 9309 and Google read it** (`robotsOf` in `packages/engine/src/crawl.ts`; the deep crawl shares it):

   | robots.txt answers | The crawler |
   |---|---|
   | 2xx | parses it and follows it (the `*` group counts) |
   | a redirect | follows up to 5 hops, to any host; the file at the end is read as the asked origin's own (RFC 9309 §2.3.1.2); a 6th hop is "unavailable" |
   | 4xx but 429: 404, 410, 401, 403 … | "unavailable": no restrictions, the page is read |
   | 5xx, 429, a timeout, a refused connection, a DNS or TLS failure | one more try after 3 s with twice the time (20 s, then 40 s); still failing: skipped as `robots-unreachable` |
   | a bot challenge instead of the file (e.g. Cloudflare's `cf-mitigated: challenge`, also after a redirect) | not the site's file, and never solved: skipped as `bot-challenge` |

   `requeue` puts sites back after a rule changed: `pnpm sotaw requeue --reason robots-unreachable` (any reason code, skipped or failed sites) sets those rows back to pending in place, no row added, attempts reset; the running crawl claims them next, in the frame's order; a crawl that had finished takes them up when `crawl` is run again.
4. **Scan.** After the rate cap (20 s from the last launch) and the gate once more: an unlinked scan row, then a job at priority 2,097,151 (the lowest), `engines: ['chromium']`. The worker runs it as any scan.
5. **Keep.** When the scan is finished, `compact(report)`: a letter for each rule (`p f r n e`), the page's script, language and direction, the platform id, the CrUX figures, the score, the rule set's version. Nothing else: no URL but the domain the row is stored under, no title, no text, no finding, no screenshot, no X-ray. The scan, with its report, is deleted at once. A bot challenge or a page that could not be read is skipped (`bot-challenge`, `no-page`), not counted as judged.
6. **Failure.** A scan that fails is tried once more (`ARABLYZER_SOTAW_MAX_ATTEMPTS`), then the site is `failed`; a scan past `ARABLYZER_SOTAW_SCAN_TIMEOUT_SECONDS` (300) is `failed` (`timeout`) and deleted. A scanner that is not there gives the attempt back and waits 15 s.

**What a visitor sees.** A visitor's scan that arrives while the crawl's scan is running waits for it (the worker takes one at a time); that is at most one Chromium scan, and the gate makes it rare: the crawl starts none while a visitor is in the queue. The worker's retry for a busy scanner is unaffected, since only one job runs.

**Expected cost (an estimate until measured on the server):** at the defaults, at most 180 scans an hour. `Y83YG` has 3,767 sites; if two thirds reach the browser step, about 2,500 scans (14 hours of launches at the cap) and about 1,250 front-page reads that end in a skip (about 2 hours): **about 16 hours of wall time, more with the pauses** when visitors are scanning. One Chromium scan at a time is the load of one visitor's scan; the scanner container's own limits (2 CPUs, 1.2 GB) are not exceeded. PostgreSQL holds about 3 KB for each site (11 MB for the frame). A list with 10,000 sites on these domains would take about 2 days.

## 4. Classification and aggregation

- **Which pages:** the Arabic pages only (global constraints). `funnel` says how many pages were judged (`reached`), how many of them are in Arabic (`arabic`) and how many are not (`notArabic`); `notArabic` (top level) is the share of the pages judged that are not in Arabic, weighted by each country's list with its interval like the whole-frame shares, published when 30 or more pages were judged. The page shows it as a figure of its own under the headline findings and as a row of the funnel, and the methodology says so.
- **Cells:** `all`, each country, each platform, each country with each platform, of Arabic pages; a cell is published only with 30 or more sites reached.
- **Interval:** every share has a 95% Wilson score interval. The whole frame's share is **weighted by each country's list** (not by the sites reached), with an interval at the effective sample size the weighted variance implies; a country's or a platform's share is the plain share of its sites.
- **What the interval does not cover:** sites not reached (robots, down, blocked) and a rule that misjudges a page. The funnel (sites in the frame, reached, skipped by reason, failed) is published, so the reader can judge.
- **Edition files, public** (`apps/web/public/data/state-of-arabic-web/<edition>/`): `aggregates.json` (the page and the explorer read it), `aggregates.csv`, `aggregates.parquet`, `schema.json` (JSON Schema, 2020-12, of the aggregates' table), `manifest.json` (size and SHA-256 of each). Aggregates only: no row of any of them is a site. `pnpm sotaw export --out DIR` makes them from the database and needs no secret.
- **Per-site rows, internal** (`pnpm sotaw export --out DIR --internal DIR2`, for our own analysis; never public, never in the manifest, refused under a `public` folder): `sites.parquet` and `sites.schema.json`, one row for each homepage judged, in Arabic or not (`arabic` says which): `site_id` (16 hex characters of an HMAC-SHA-256 of the domain under `ARABLYZER_SOTAW_SALT`, 32+ characters, never published), edition, country (`other` when under 30), rank bucket, platform, script, language, direction, engines, score, one column for each metric, and the compact rule letters. No domain, rank, URL or CrUX figure.
- **Licence:** the aggregates under CC BY 4.0. There is no per-site dataset to license.

## 5. The site

- **Pages:** `/state-of-arabic-web` and `/en/state-of-arabic-web`, in the sitemap, the footer's about column, the knowledge hub, `llms.txt`; one Open Graph image like every page.
- **Without an edition** (today): the head, the methodology (what is measured, the frame, how the crawl behaves, limits, ethics, opt-out), «الإصدار الأول قريباً», and `WebPage` + `BreadcrumbList` JSON-LD. No `Dataset` markup and no number.
- **With an edition** (`aggregates.json` present): headline findings as large numbers on a ledger (each with its interval and denominator); a per-country comparison for the metric chosen in a tab (inline SVG bars with intervals, text alternative and a table); platform shares; the funnel; the dataset's downloads (links only for files in the manifest); the citation block; `Dataset` JSON-LD (name, description, license, creator, temporal coverage, variables measured, distribution with `contentUrl` and `sha256` from the manifest, citation) so that Google Dataset Search can list it; a partial crawl says so.
- **Explorer:** a Preact island (`client:visible`) that loads `aggregates.json` once and shows, for a country and a platform chosen, any metric's distribution (a binary metric's share with its interval; a distribution's categories). A selection with fewer than 30 sites says so instead of showing a number. The page works without it (the figures and the table are in the HTML).

## 6. Tasks

| # | Task | Tests |
|---|---|---|
| 1 | `packages/sotaw`: countries, frame, exclusions, stats, outcome, metrics, aggregate, dataset (Parquet, CSV, JSON Schema), edition | frame filtering and determinism, the exclusion rules and the committed frame, allocation, intervals, metrics, Arabic-pages aggregation, suppression, Parquet round trip, aggregates-only public files |
| 2 | Store (memory, PostgreSQL, migration 0010), `ScanQueue.add` priority, `BullMQScanQueue.busy()` | the store's contract in memory; services suite for PostgreSQL |
| 3 | Runner and CLI (`frame`, `crawl`, `status`, `export`), compose service `sotaw` | the schedule: pauses while visitors wait, lowest priority, rate cap, concurrency, resume, robots, retries |
| 4 | Copy (`packages/i18n/src/sotaw.ts`), the page, the explorer, the footer and hub links, `llms.txt`, the sitemap, the OG kicker | the page with and without data (fixture edition), the copy's keys, the self-audit |
| 5 | The frame (Y83YG), CI, the PR | `pnpm site:audit`, the whole CI |

## 7. Owner decisions and needs

1. **Start the crawl** on the server (commands in the PR), after reading the frame in `packages/sotaw/data/frames`.
2. **An opt-out address**, `optout@arablyzer.com`, and someone reading it; a site that asks is added to `data/opt-out.txt` and to the frame's next edition.
3. ~~The licence of the per-site rows~~: decided, aggregates only (2026-10-16); per-site rows are internal.
4. **The salt** `ARABLYZER_SOTAW_SALT`, only for the internal per-site export: `openssl rand -hex 32`, kept off the repository. The public export needs none.
5. **A CrUX key on the scanner** (`ARABLYZER_CRUX_KEY`) if the Core Web Vitals are wanted; without it, the page says CrUX was not collected.
6. **Review of the Arabic copy** (`reviewed: false`) and the wording of the headline findings once the numbers exist.
7. **Naming policy** stays aggregates only (BUILD-PLAN left it to the owner).
