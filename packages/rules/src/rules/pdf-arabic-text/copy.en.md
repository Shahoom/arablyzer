# An Arabic PDF that machines cannot read

## Messages

### reversed

The text of {url} comes out with its letters reversed (visual order): words such as «{example}» read backwards, {percent}% of the known words. The page reads well to the eye, and a search finds words that do not exist.

### presentation-forms

The text of {url} is made of presentation-form letters (such as «{example}») instead of the base letters, {percent}% of its Arabic letters. The shape displays right, but search and AI do not match it with the word typed in plain letters.

### no-unicode-map

The text of {url} comes out as unreadable symbols (such as «{example}») because the file's font has no Unicode map (ToUnicode): a reader sees Arabic letters, and a machine finds only symbols.

### image-only

The pages of {url} have no text ({percent}% of the pages we read): each page is a picture, so nothing can be copied or searched, and a screen reader reads nothing.

## Why it matters

- **A PDF is often the most important thing on a site**: reports, terms, contracts, catalogues. Its text does not reach search or AI assistants if it is reversed, has no map, or is a picture.
- **Copy and paste breaks**: someone who copies a paragraph gets reversed letters or symbols, and a screen reader cannot read the page.
- **The problem comes from how the file was exported**, not from its content, so it is fixed by exporting again with the right settings.

## How to fix

- From Word: Save as PDF, choose «Best for electronic distribution and accessibility», do not use «Print to PDF», and check that the font is embedded.
- From InDesign: use the Middle Eastern (ME) edition with the World-Ready Paragraph Composer, and export «Adobe PDF (Interactive/Print)» with «Create Tagged PDF» on and the fonts embedded.
- Do not convert text to outlines when exporting.
- From a scan: run Arabic OCR, with Tesseract (`ara`), Adobe Acrobat or ABBYY.
- Keep fonts embedded with a ToUnicode map (modern programs do it by themselves with OpenType and TrueType fonts).
- After exporting, select a paragraph and paste it into a text file: if it comes out right, the file is sound.

## How we detect

1. We fetch up to 3 PDFs the page links (15 MB each at most) the way we fetch the page, as ArablyzerBot, after reading the robots.txt of each file's own host; and we open a file only after it starts with `%PDF-`.
2. We read its text with the pdf.js library in an isolated thread with a heap and time limit, the first 20 pages only, running no script.
3. Reversed: words from a short list of common Arabic words appear backwards (3 at least and twice as many as the right ones), or three words begin with a ta marbuta, which no Arabic word does.
4. Presentation forms: 20% or more of the Arabic letters are in U+FB50–FDFF and U+FE70–FEFF.
5. No Unicode map: 5% or more of the characters are in the private-use range (U+E000–F8FF) or replacement characters, or 30% accented Latin letters (U+00C0–00FF) in a file linked from an Arabic page, with no Arabic letters. An estimate that cannot see the font itself.
6. Image: half of the pages read, or more, have no text.
7. We report each file and each problem, at moderate severity.

## References

- [Adobe: create accessible PDFs](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html)
- [PDF Association: PDF/UA](https://pdfa.org/resource/iso-14289-pdf-ua/)
- [pdf.js](https://mozilla.github.io/pdf.js/)
