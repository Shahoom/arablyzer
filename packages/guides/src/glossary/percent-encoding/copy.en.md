---
reviewed: false
---

# Percent-encoding

Percent-encoding writes each UTF-8 byte in a URL as a % sign followed by two hexadecimal digits, which is why Arabic in copied links looks like %D9%82%D9%87%D9%88%D8%A9.

## Definition

- A URL is built from a limited set of characters: letters, digits and a few symbols (RFC 3986, section 2). Anything else is written percent-encoded: a `%` followed by two hexadecimal digits for each byte (section 2.1).
- The characters that need no encoding are Latin letters, digits, the hyphen `-`, the period `.`, the underscore `_` and the tilde `~` (section 2.3). Reserved characters such as `/`, `?`, `#` and `&` should be encoded when they are part of the data rather than of the URL's structure (section 2.2).
- The WHATWG URL Standard has the URL parser turn every code point above `U+007F` into percent-encoded UTF-8 bytes. The letter ق (`U+0642`) is the two bytes `D9 82`, so it is written `%D9%82`, and the word قهوة (coffee) becomes `%D9%82%D9%87%D9%88%D8%A9`: four Arabic letters, six characters each.
- A `%` that is itself data is encoded as `%25` (RFC 3986, section 2.4). RFC 3986 also advises producers to write the hexadecimal digits in uppercase, though lowercase is equivalent.

## Why it matters

- The link `/products/%D9%82%D9%87%D9%88%D8%A9` is the same link as one whose last part reads قهوة: two forms of one address, one as it is sent and one as it is read. Arablyzer's slug generator shows both.
- Google's URL structure guide says non-ASCII characters should be percent-encoded in the `href` attribute, and illustrates it with Arabic words: `https://example.com/%D9%86%D8%B9%D9%86%D8%A7%D8%B9/%D8%A8%D9%82%D8%A7%D9%84%D8%A9` is recommended and `https://example.com/نعناع` is not.
- A crawler reads every difference in a URL as another page, as the `url-slug-invalid` rule explains. So pick one form for the canonical URL and use it everywhere.
- The encoding should always be UTF-8. Bytes from another encoding, such as Windows-1256 in `%C7%E1`, are not valid UTF-8, so a message or an address arrives garbled or is rejected.
- Encoding twice ruins the Arabic: the first `%` becomes `%25`, so after one decoding the receiver finds the text `%D9%85` instead of the letter.
- The `url-slug-invalid` rule reads a URL's last part as people read it, after decoding, and the `whatsapp-text-encoding` rule checks the message inside a WhatsApp link.

## Example

In JavaScript:

```js
encodeURIComponent('قهوة')
// '%D9%82%D9%87%D9%88%D8%A9'

new URL('https://shop.example/products/قهوة-عربية-2026').pathname
// '/products/%D9%82%D9%87%D9%88%D8%A9-%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-2026'

// Encoded twice:
encodeURIComponent(encodeURIComponent('قهوة'))
// '%25D9%2582%25D9%2587%25D9%2588%25D8%25A9'
```

`encodeURIComponent` leaves Latin letters, digits and `- _ . ! ~ * ' ( )` as they are (MDN), so `-2026` stays as written in the slug.

## Common mistakes

- Encoding the text twice, say a template encodes it and a plugin encodes it again: visitors see `%D9%85…` instead of Arabic.
- Passing a whole URL to `encodeURIComponent`: MDN says it encodes more than `encodeURI` does, including characters of the URL's syntax, so `:`, `/` and `?` get encoded and the link breaks. Encode the value alone, then build the URL.
- Leaving a raw `#` or `&` in a value: the query ends at the first `#` (RFC 3986, section 3.4) and a fragment begins, while `&` separates parameters. Write them as `%23` and `%26`.
- Writing a space as `+` outside web forms: `+` for a space belongs to the `application/x-www-form-urlencoded` format that forms use (WHATWG); in an ordinary path or query a space is `%20`.
- Encoding a URL with something other than UTF-8 because the source page is saved in another encoding: HTML says forms and URL encoding use the document's encoding by default.

## References

- [IETF: RFC 3986, percent-encoding](https://www.rfc-editor.org/rfc/rfc3986#section-2.1)
- [WHATWG URL Standard: percent-encoded bytes](https://url.spec.whatwg.org/#percent-encoded-bytes)
- [Google Search Central: URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [MDN: encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
