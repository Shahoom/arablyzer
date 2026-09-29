# Mojibake

Mojibake is text decoded with the wrong character encoding, so Arabic shows as strings of Latin symbols; it comes from a declared encoding that differs from the real one.

## Definition

- Text is stored as bytes, and a character encoding maps the bytes to characters. Read with an encoding other than the one it was written in, the same bytes turn into other characters: that garbled text is mojibake.
- For example, UTF-8 text read as Windows-1252 turns each Arabic letter into two Latin characters, so «العربية» shows as `Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©`. Text in the older Windows-1256 encoding, read the same way, shows as `ÇáÚÑÈíÉ`.
- Browsers read a page labelled `iso-8859-1`, `latin1` or `ascii` as Windows-1252: the WHATWG Encoding Standard makes those labels names of the same encoding.

## Why it matters

- Visitors see symbols instead of the text.
- Search engines index the symbols as they are, so the page does not come up for the Arabic words you wrote.
- The cause is usually a declaration that does not match the file: a server that sends `charset=windows-1252` or `iso-8859-1` for a page saved in UTF-8, or text stored in a database in the wrong encoding and shown as it is.

## Example

Save the files in UTF-8, and declare it both in the server's header and at the top of `<head>`:

```
Content-Type: text/html; charset=utf-8
```

```html
<head>
  <meta charset="utf-8">
  <title>المتجر</title>
</head>
```

The W3C asks that the `<meta>` fit within the first 1024 bytes of the file, so it is best right after `<head>`. When the header and the `<meta>` disagree, the header wins.

## Common mistakes

- Declaring UTF-8 without saving the files in UTF-8: the declaration has to match the bytes.
- Fixing the page's declaration while the database still holds text in the wrong encoding: that text needs repair too, by a developer, after a backup.
- Pasting garbled text back into the editor: the symbols become the page's real text, and no declaration can bring the Arabic back.

## References

- [W3C: Declaring character encodings in HTML](https://www.w3.org/International/questions/qa-html-encoding-declarations)
- [W3C: Character encodings for beginners](https://www.w3.org/International/questions/qa-what-is-encoding)
- [WHATWG Encoding Standard: names and labels](https://encoding.spec.whatwg.org/#names-and-labels)
