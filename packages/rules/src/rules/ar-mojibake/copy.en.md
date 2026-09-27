# Garbled Arabic text (mojibake)

## Messages

### from-utf-8

UTF-8 Arabic text shows on the page as meaningless symbols, because it was read as Windows-1252: «{found}», which was «{recovered}».

### from-windows-1256

Windows-1256 Arabic text shows on the page as meaningless symbols, because it was read as Windows-1252: «{found}», which was «{recovered}».

## Why it matters

- **Visitors** see meaningless symbols instead of the Arabic text, cannot read the content, and lose trust in the site.
- **Search engines** index the symbols as they are, so the page does not come up for people searching the Arabic words you wrote.
- **The cause** is usually a server that declares an encoding other than the file's own, such as `charset=windows-1252` or `iso-8859-1` for a page written in UTF-8, or text stored in a database in the wrong encoding and shown as it is.

## How to fix

- Save the site's files in UTF-8, and declare it in the server and in the page:

```html
<meta charset="utf-8" />
```

```
Content-Type: text/html; charset=utf-8
```

- If the garbled text comes from the database, set the connection and tables to `utf8mb4`, then repair the text stored in the wrong encoding; this is best left to a developer, with a backup made before any change.
- In WordPress, check the `DB_CHARSET` value in `wp-config.php` and the tables' encoding.

## How we detect

1. We read the page's HTML as the server sends it, decode it as the browser does, and read the visible text.
2. We look for words made of Latin letters such as `Ø`, `Ù`, `Ç` and `á`, turn each word back into its Windows-1252 bytes, and read them as UTF-8 or Windows-1256.
3. A word counts as garbled only when reading it again gives two or more Arabic letters and leaves no Latin letter, so words such as «Café», «Crème» and «señor» do not count. A garbled word standing alone must give at least four Arabic letters, and words read as Windows-1256 count only when their run has an alef or a lam, as Arabic text does, so a line such as «ÆØÅ æøå» does not count.
4. We report the first run of garbled words in each text, up to eight words, with what they were before.

## References

- [W3C: Declaring character encodings in HTML](https://www.w3.org/International/questions/qa-html-encoding-declarations)
- [WHATWG Encoding Standard: Windows-1252 and Windows-1256](https://encoding.spec.whatwg.org/#legacy-single-byte-encodings)
