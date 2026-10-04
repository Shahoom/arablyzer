# Arabic-native features

Six features that only make sense for Arabic pages. Each says what it decides, where it stops, and what it depends on. All the words are Arabic first and `reviewed: false` until the owner reads them. None of them is deducted from the score except the two rules marked as such in §4 and §5.

## 1. Arabic font slimmer (`ar-font-subset-savings`, tool `arabic-font-slimmer`)

- **Decides:** for each Arabic web font file the render loaded, the characters of the page's own Arabic text set in it (up to 400) and what a WOFF2 subset of those characters, with the shaping tables kept, would weigh. The rule reports files whose subset saves most of their size.
- **Limits:** the subset is made when the visitor presses download (`apps/api/src/fonts.ts`), from the font file on the owner's site, and is not stored. It is made from one page's text, so a font used on other pages needs their characters too (the card says so). Fonts the scan could not read have no subset.
- **Depends on:** the render's `files` step, `subset-font` (HarfBuzz), the font file being fetchable through the egress rules.

## 2. Arabic spelling search test (`search-spelling-variants`)

- **Decides:** asks the site's own search for a few words of the page and for their spelling variants (ة/ه, ى/ي, hamza forms, tatweel, diacritics, the other digit set), then compares what comes back with the plain spelling. A variant that finds fewer results than the word is "lost".
- **Limits:** at most 12 requests, 400 ms apart, 45 s in all, robots.txt respected; one of the requests is a nonsense query that tells "no results" pages from the rest. The number of results is read from the first page of the answer, so it is a floor. Arabizi is shown and not counted. A site with no search form and no known platform search address is not tested.
- **Depends on:** the page's HTML for the form, the platform check for WordPress-style addresses, `safeFetch`.

## 3. Country fit «ملاءمة البلد» (rule `country-fit`, rule `sar-sign-font`, tool `country-fit`)

- **Decides which country** (SA, AE, EG, KW, QA, BH, OM, JO, MA) from what the page says: the ccTLD, the region of `lang` and `hreflang`, a currency that belongs to one country (ر.س, SAR, د.إ, ج.م, ...), and calling codes of the phone numbers it shows. A country is named only when at least two kinds of evidence agree and it outweighs every other country by two. One kind alone is `thin`, and ties are `unclear`: both say so and give no percentage. It never guesses.
- **Scores the fit** over the items the page has something to judge for, each `ok`, `gap` or `unknown` (unknown is not counted): the currency of its prices and the sign; phone numbers with the country code; the digit style the country reads (Latin in the Maghreb, either elsewhere); a VAT statement for SA and AE; Hijri dates where expected; the region of the language tag. "Ready X% for <country>" is shown with three or more items judged.
- **The riyal sign:** U+20C1 (Unicode 17, 2025) draws an empty box in a font that predates it. The browser reports every element whose own text has it, with its font-family; the font coverage the render reads from the page's font files now keeps U+20C1 beside the Arabic blocks. `sar-sign-font` (minor) walks the font-family list as the browser does, and reports when web fonts come first and none has the sign. A list with no web font is not judged: only the visitor's device can answer.
- **Limits:** text in images, prices written by scripts the HTML does not show (the rule reads the HTML as sent), a multi-country site, and countries outside the nine. Information, never deducted.
- **Depends on:** `packages/rules/src/lib/country.ts`, the render's `arabicFontCoverage`.

## 4. AI readability of Arabic «قابلية قراءة الذكاء الاصطناعي للعربي» (rule `ar-ai-readability`)

- **Decides:** six kinds of Arabic text that read the same to people and differently to search indexes, retrievers and tokenizers. One finding for each kind found, with the count, the first example and a fix: tatweel inside words; invisible characters (ZWSP, word joiner, a stray BOM, and LRM, RLM or ALM between two letters or digits); Arabic-Indic and Latin digits inside one number; text thick with diacritics (a paragraph of 20 letters or more where marks are a quarter of the letters, reported at 100 such letters); letters in the presentation forms (U+FB50 to U+FEFE, leaving out the ornate parentheses and ﷺ ﷻ ﷼ ﷽); and Arabic that looks to be only in pictures (fewer than 60 Arabic letters in the text, and image alts that are Arabic sentences of 8 words or more).
- **Limits:** text as the server sends it (no scripts), code tags left out, Quranic text left out of the diacritics count. "Only in pictures" is a hint from alt texts: the pixels are not read. Tatweel and digits overlap `ar-tatweel` and `ar-digits-mixed` (which judge the page as a whole), so a page can fail both; the fixtures say so (`expect.json`). Minor.
- **Depends on:** the text segments collector.

## 5. Icons that point against their button «الأيقونات المعكوسة» (rule `rtl-icon-role`)

- **Decides:** in the rendered page, for each control (`a`, `button`, `[role=button|link]`, or a class with next or prev) in right-to-left text: its role from its label (`aria-label`, `title`, text), `rel` or class (التالي, المزيد, next, السابق, رجوع, back, ...), and where its icon points on screen: an icon-font class (`fa-arrow-right`, `bi-chevron-left`), a Material name, an SVG's `<use>` href or data attribute, or an arrow character. The direction is turned by a mirroring transform on the icon, its `::before` or `::after`, or three ancestors. It reports a control whose every icon points against its role: right for "next", left for "back". Moderate.
- **Low false positives by construction:** nothing is judged without both a role and an icon of known direction; a control whose label has both roles, or is left to right, is skipped; and when a stylesheet of the page sets what an icon class draws for right to left (`[dir=rtl] .fa-arrow-right::before { content }`), classes say nothing and the page is not judged by them. An icon the older `rtl-mirrored-icons` (review) would also list is left to this rule.
- **Limits:** an inline SVG with no name and no class is not read (its path would have to be); cross-origin stylesheets cannot be read for the swap check; icons drawn as background images are not seen.
- **Depends on:** the render (`roleIcons` in the measure step, three engines).

## 6. Arabic X-ray «أشعة الحرف العربي» (report card, fact `xray`)

- **Decides:** in each engine, the pass goes through the page's Arabic words and calls a word broken when it has a letter no font in its element's font-family list draws (the judgement of `ar-font-missing-letters`, made from the web fonts' coverage), or U+FFFD. It keeps the counts for the whole page and the boxes of the broken words that stand in the first screen (up to 40). The card draws a ring round each over the engine's picture, as SVG over the stored image, in the browser. **Arabic integrity** = the share of Arabic words drawn correctly across the engines (broken words over all words counted, never 100 while one is broken).
- **Storage:** one JPEG of the first screen (the 390 x 844 render viewport, CSS pixels) per engine, at quality 55, or 35 when over 70,000 bytes, and none when still over. It is carried in the report as a `data:` URL, at most about 94 KB, 3 engines at most, so retention (`deleteOlderThan`) and the owner's delete token cover it with nothing else to track. The CSP gains `data:` in `img-src` for it. The scanner asks for it in whole scans only; a tool's scan drops it.
- **Limits:** the judgement is the web fonts' and the replacement characters'; what a visitor's own fonts draw is unknown. Pages with more than 20,000 Arabic words are counted to that point (`truncated`). The picture is the first screen only; broken words below it are counted and listed as a number.
- **Depends on:** `fontCoverage` and the usual render, JPEG screenshots of Playwright.

## Five more ideas, Arabic only

1. **Shaping check in the wild:** compare each Arabic word's drawn width with the same word in a reference font to catch joined letters drawn apart (broken shaping), not only missing glyphs.
2. **Dialect and register:** tell Modern Standard from Gulf, Egyptian or Levantine text on the page and flag a mix a country's readers would find odd.
3. **Search-engine spelling sets:** the same word in the ten most common misspellings, asked of Google's suggest, to show which ones the page's own text covers.
4. **Numbers read aloud:** a screen-reader probe for Arabic-Indic digits, currency and dates, to see how a TTS voice speaks the page's prices.
5. **Transliteration of the brand:** the brand's name in Arabic and Latin spellings across title, headings, schema.org and links, flagged where they disagree.
