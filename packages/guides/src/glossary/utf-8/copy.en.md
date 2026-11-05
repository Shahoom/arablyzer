---
reviewed: false
---

# UTF-8 encoding

UTF-8 writes each Unicode character as one to four bytes and is the encoding HTML requires; Arabic arrives intact with it, as long as the declaration matches the file.

## Definition

- UTF-8 is a transformation format of the universal character set (Unicode and ISO 10646). It writes each character from `U+0000` to `U+10FFFF` as one to four bytes, and ASCII characters stay a single byte with their usual value (RFC 3629, sections 1 and 3).
- Characters from `U+0080` to `U+07FF` take two bytes (RFC 3629, section 3). The Arabic letter ق (`U+0642`) falls in that range, so it is written as the two bytes `D9 82`, as is every letter in the basic Arabic block.
- The WHATWG Encoding Standard calls UTF-8 the most appropriate encoding for interchange of Unicode, and says new protocols and formats must use it exclusively. HTML (section 4.2.5.4) requires the document's actual encoding to be UTF-8, and any declaration of it to use the label `utf-8`, in any letter case.
- The encoding is declared in the server's `Content-Type: text/html; charset=utf-8` header, or in a `<meta charset="utf-8">` tag that must fit entirely within the first 1024 bytes of the document. When the two disagree, the server's header wins, and a byte order mark (BOM) at the start of the file outranks both (W3C).

## Why it matters

- UTF-8 carries every Unicode character, so Arabic, English, digits and symbols can share one page without a legacy encoding for each language.
- When UTF-8 bytes are read as another encoding, the text comes out garbled: every Arabic letter is two bytes, which Windows-1252 reads as two Latin characters. That is mojibake, which the `ar-mojibake` rule and the Arabic encoding checker detect.
- A declaration alone does not repair a file: the W3C says you also have to save the file as UTF-8.
- HTML notes that encodings other than UTF-8 cause problems with form submission and URL encoding, because both use the document's encoding by default. That is how UTF-8 ties into percent-encoding in links.
- The encoding does not tell the browser what language the text is in: the `lang` attribute does that, and neither replaces the other.

## Example

The declaration in the server's header and at the top of `<head>`, with the file itself saved as UTF-8:

```
Content-Type: text/html; charset=utf-8
```

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>المتجر</title>
  </head>
```

This is how the letter ق is written as bytes:

```js
new TextEncoder().encode('ق') // Uint8Array [217, 130], that is D9 82
```

## Common mistakes

- Declaring UTF-8 without saving the file in it: the declaration has to match the bytes.
- Putting the `<meta charset>` tag after the first 1024 bytes of the file, for instance behind long inline scripts or styles. Place it right after `<head>`.
- Letting the header and the tag disagree: the header wins, so the tag misleads whoever reads the code.
- Using both a `charset` tag and an `http-equiv` tag for the encoding: HTML does not allow the two in one document.
- Leaving the database, or its connection, in another encoding, so text goes in and comes out garbled. The `ar-mojibake` rule suggests the `utf8mb4` encoding in MySQL.

## References

- [WHATWG: Encoding Standard](https://encoding.spec.whatwg.org/)
- [WHATWG HTML: Specifying the document's character encoding](https://html.spec.whatwg.org/multipage/semantics.html#charset)
- [IETF: RFC 3629, UTF-8, a transformation format of ISO 10646](https://www.rfc-editor.org/rfc/rfc3629)
- [W3C: Declaring character encodings in HTML](https://www.w3.org/International/questions/qa-html-encoding-declarations)
