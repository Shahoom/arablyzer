# WhatsApp link message is encoded wrongly

## Messages

### double-encoded

The message of this WhatsApp link is encoded twice (“{text}”): the customer will see %D9%85… in the chat box instead of Arabic.

### invalid-utf8

The message of this WhatsApp link (“{text}”) is not UTF-8, so the Arabic arrives as broken letters or is refused; it looks like Windows-1256 or Latin-1 bytes.

### bad-escape

The message of this WhatsApp link (“{text}”) has a % that is not followed by two hexadecimal digits; write a literal % as %25.

### garbled

The message of this WhatsApp link arrives garbled (“{sample}”): Arabic read in the wrong encoding.

### hash-truncates

The message of this WhatsApp link has a raw # in it (“{text}”), which ends the address: “{lost}” and everything after it is dropped. Write # as %23.

### template

The message of this WhatsApp link still holds a placeholder, {placeholder}, that was not filled in.

## Why it matters

- A pre-filled message turns a tap into a conversation that already says what the customer wants: which product, which order. When it arrives wrong, the customer sees %D9%85… or strange letters, and most do not send it.
- Arabic must be percent-encoded as UTF-8 bytes. Two layers of encoding (a theme encodes, then a plugin encodes again), a Windows-1256 server, a raw `#` in an order number, or a template whose placeholder was never filled are how it goes wrong.
- The page looks right and the button works: only a customer who taps it sees the message.

## How to fix

Encode the message once, as UTF-8, with `encodeURIComponent` in JavaScript, `rawurlencode` in PHP, or the platform's URL-encode filter:

```html
<a href="https://wa.me/96891234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7">اسأل عن العطر</a>
```

- Encode the text only, not the whole address: `https://wa.me/<number>?text=` + encoded message.
- A `#` in the message is `%23`, a `&` is `%26`, a space is `%20`, a new line is `%0A`.
- A literal `%` is `%25`.
- For a product button, build the message from the product's name on the server and encode it once; do not leave `{{product_name}}` for the browser.
- Test the button on a phone: the message should appear in the chat box as Arabic.

## How we detect

1. We find the page's WhatsApp links (`wa.me`, `api.whatsapp.com/send`, `web.whatsapp.com/send`, `whatsapp://send`) that have a `text` parameter, and read the text as written in the link.
2. A raw `#` ends the address: the text after it is not part of the message.
3. `%25` followed by two hexadecimal digits means the text was encoded twice.
4. We decode the escapes into bytes and read them as UTF-8: bytes that are not valid UTF-8 are reported, and so is a `%` without two digits.
5. We read the decoded message for Arabic garbled by a wrong encoding, and for placeholders such as `{{name}}`, `${name}`, `{name}` and `[[name]]`.

The number in the link is checked by the WhatsApp link format rule. We never open the link or contact WhatsApp.

## References

- [WhatsApp Help Center: How to use click to chat](https://faq.whatsapp.com/5913398998672934/)
- [RFC 3986: Percent-encoding](https://www.rfc-editor.org/rfc/rfc3986#section-2.1)
- [MDN: encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
