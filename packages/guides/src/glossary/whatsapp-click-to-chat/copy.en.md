---
reviewed: false
---

# WhatsApp click to chat link (wa.me)

A WhatsApp click to chat link is a wa.me link with a full international number and, optionally, a ready message after text= that is URL-encoded and appears in the chat box.

## Definition

- WhatsApp's help center describes a chat link in the form `https://wa.me/<number>`, where `<number>` is a full phone number in international format. It says to omit any zeroes, brackets or dashes when writing the number. Its correct example is `https://wa.me/1XXXXXXXXXX` and its incorrect one `https://wa.me/+001-(XXX)XXXXXXX`, which has a `+` sign, zeroes, parentheses and a dash.
- For a pre-filled message WhatsApp gives the form `https://wa.me/whatsappphonenumber?text=urlencodedtext`, where `urlencodedtext` is the URL-encoded message. The pre-filled message appears automatically in the text field of the chat; its example is `https://wa.me/1XXXXXXXXXX?text=I'm%20interested%20in%20your%20car%20for%20sale`.
- A link with only a message is `https://wa.me/?text=urlencodedtext`, and whoever taps it sees a list of contacts to send the message to.
- WhatsApp's page does not explain the encoding rules; its examples write the space as `%20`. Arabic is percent-encoded as UTF-8 bytes.

## Why it matters

- A ready message turns a tap on the button into a conversation that says what the customer wants, such as the product they are asking about.
- A broken link does not show on your page: the page looks fine and the button works, and only a customer who taps it sees the message. If it arrives garbled, the customer sees `%D9%85…` or broken letters, and most do not send it.
- The `whatsapp-link-format` rule says WhatsApp documents one form for chat links, and others are not guaranteed to work: depending on the form and the app, WhatsApp may show an error or fail to find the account.
- An Arabic message in a link goes wrong for these reasons: encoded twice, a server that encodes with Windows-1256, a raw `#` in an order number, or a template whose variable was never filled in. The `whatsapp-text-encoding` rule checks for them.
- Three Arablyzer tools touch this link: the WhatsApp link checker checks the number alone, the order-button checker checks the number and the message together, and the link generator builds the link and its HTML in your browser. None of them contacts WhatsApp, so none can tell whether the number has an account.

## Example

A local Saudi number is 050 123 4567. Drop the local leading zero, put the country code `966` in front, and encode the message once:

```js
const number = '966501234567'
const message = 'مرحباً، أريد الاستفسار عن عطر العود'
const link = `https://wa.me/${number}?text=${encodeURIComponent(message)}`
```

The result in the page:

```html
<a href="https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%B9%D8%B7%D8%B1%20%D8%A7%D9%84%D8%B9%D9%88%D8%AF">Message us on WhatsApp</a>
```

Had the message been encoded twice, it would begin `%25D9%2585%25D8%25B1…`, and the customer would see `%D9%85%D8%B1…` in the chat box instead of Arabic.

## Common mistakes

- Writing the number with a `+` sign, spaces, dashes or parentheses, or with a leading zero: `0501234567` and `+966 50 123 4567` are both wrong, and `966501234567` is right.
- Keeping the local trunk zero after the country code, as in `9660501234567`.
- Writing the number in Eastern Arabic numerals, such as `٩٦٦…`: WhatsApp needs the digits 0 to 9.
- Encoding the message twice, for example a template encodes it and a plugin encodes it again.
- A message encoded in something other than UTF-8, such as Windows-1256 or Latin-1: it arrives as broken letters or is rejected.
- A raw `#` or `&` in the message, such as the order number `#1042`: the query ends at `#`, so the rest of the message is lost. Write them `%23` and `%26`.
- Leaving an unfilled template variable, such as `{{product_name}}`, in the link.

## References

- [WhatsApp Help Center: How to use click to chat](https://faq.whatsapp.com/5913398998672934/)
- [IETF: RFC 3986, percent-encoding](https://www.rfc-editor.org/rfc/rfc3986#section-2.1)
- [MDN: encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
