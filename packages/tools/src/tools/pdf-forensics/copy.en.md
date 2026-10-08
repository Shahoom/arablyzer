---
summary: Can the Arabic PDFs your page links be read? Reversed letters, unmapped fonts, picture pages.
---

# Arabic PDF forensics

Fetches up to 3 PDFs from the page and reads their text as search engines and AI read it, then says what is broken in it and how to export it again.

## What it checks

- Reversed letters (visual order): words that come out backwards in search or when copied.
- Presentation forms (U+FB50 to U+FEFF) instead of the base letters.
- A font with no Unicode map (ToUnicode): the text comes out as unreadable symbols.
- Picture pages with no text layer (scanned).
- The document's title and language.
- Up to 3 files, 15 MB each, from the page and from any site whose robots.txt lets them be fetched.

## Example

### Wrong

```html
<p><a href="https://www.example.com/files/annual-report.pdf">تنزيل التقرير السنوي ملف PDF</a></p>
```

### Right

```html
<p><a href="https://www.example.com/files/annual-report.pdf">تنزيل التقرير السنوي الكامل ملف PDF</a></p>
```

## How to fix

- Word: Save as PDF with «Best for electronic distribution and accessibility», check that the font is embedded, and do not use «Print to PDF».
- InDesign: use the Middle Eastern (ME) edition with the World-Ready Paragraph Composer, and export with «Create Tagged PDF» and the fonts embedded; do not convert text to outlines.
- A scanned file: run Arabic OCR (Tesseract `ara`, Acrobat or ABBYY).
- Write the document's title and its language (Arabic) in the file's properties.
- Test the result: copy a paragraph from the file into a text file; if it comes out right, the file is sound.

```bash
ocrmypdf -l ara input.pdf output.pdf
```

## FAQ

### Why does the file look fine to me and fail the check?

Because the eye reads shapes and a machine reads the letters behind them. A file drawn with reversed letters or with a font that has no map looks right on screen.

### Do you keep my files?

No. We fetch the file and read its text in memory and throw away everything but the numbers and the short excerpt that shows in the report, which stays with the report and is deleted with it.

### Why were some of my files not read?

Because robots.txt keeps ArablyzerBot from fetching them, or they are over 15 MB, or encrypted with a password, or not real PDFs, or the server did not answer. We write the reason beside each file.

## Methodology

We take the page's links whose path ends in `.pdf`, its own site's first, fetch them one at a time as ArablyzerBot after the file's own site's robots.txt allows it, and read the first 20 pages with the pdf.js library in an isolated thread with a heap and time limit. The checks are estimates based on a short list of common words and on character shares, and we give the measure behind each.
