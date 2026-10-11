---
summary: Does your Arabic turn into strange Latin symbols because the page is read in the wrong encoding?
---

# Arabic encoding (mojibake) checker

Reads the text of a page and finds Arabic that shows as meaningless Latin symbols, (strings of letters like Ø, Ù and Ç), because the page was written in one encoding and read in another. It also says which encoding the text was written in and what it said.

## What it checks

- UTF-8 Arabic read as Windows-1252, the commonest case: `Ù…Ù†ØªØ¬` for «منتج».
- Windows-1256 Arabic (the old Arabic code page) read as Windows-1252: `ÇáÚÑÈíÉ` for «العربية».
- That a word counts only when decoding it again gives Arabic letters and no Latin ones, so «Café» and «señor» are left alone.
- The first run of garbled words in each text, with what it said.

## Example

### Wrong

```html
<p>آراء العملاء في عطر الورد الطائفي خلال الشهر الماضي.</p>
<blockquote>Ù…Ù†ØªØ¬ Ø±Ø§Ø¦Ø¹ ÙˆØµÙ„Ù†ÙŠ Ø¨Ø³Ø±Ø¹Ø©</blockquote>
```

### Right

```html
<p>آراء العملاء في عطر الورد الطائفي خلال الشهر الماضي.</p>
<blockquote>منتج رائع وصلني بسرعة</blockquote>
```

## How to fix

1. Save every file as UTF-8 and serve it with `Content-Type: text/html; charset=utf-8`; add `<meta charset="utf-8" />` as the first tag in `<head>`.
2. If only one part is garbled (a review, a product name, an imported field), the data was stored or imported in the wrong encoding: re-import it as UTF-8, or convert the database column (`utf8mb4` in MySQL).
3. If the garbled text came from a feed, a plugin or an import file, fix the source file's encoding, not the page.
4. After fixing, clear the page cache.
5. On Salla, Zid and Shopify, garbled text usually came in through a product import: re-import the file as UTF-8 (in Excel, save as "CSV UTF-8").

For example:

```html
<meta charset="utf-8" />
```

## FAQ

### Why does the text show as `Ù…Ù†ØªØ¬`?

Because the bytes are UTF-8 and the program reading them thinks they are Windows-1252 (or Latin-1). Each Arabic letter is two bytes in UTF-8, and each byte shows as one Latin symbol.

### How is this different from the charset check?

This tool reads the result: garbled text that is on the page. The cause is almost always a charset mismatch, but a page can declare UTF-8 correctly and still hold garbled text that was stored that way.

### My text shows as question marks. Is that the same?

Related, but different: question marks mean the letters were lost when the data was converted to an encoding that cannot hold Arabic. They cannot be recovered; the source must be re-imported.

### Does it fix the text?

No, but it shows what each garbled word said, so that you can check the repair.

## Methodology

We read the visible text of the page's HTML as the server sends it, decode it as the browser does, and look for words made of Latin letters such as `Ø`, `Ù`, `Ç` and `á`. Each word is turned back into its Windows-1252 bytes and read as UTF-8 or Windows-1256; it counts only when the result is two or more Arabic letters and no Latin letter. See the rule's page for the details.
