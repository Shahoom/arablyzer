# WhatsApp link checker

Checks that the WhatsApp links on your page use the format WhatsApp documents, the full international number in digits only, and suggests the right form when it is clear.

## What it checks

- Links to `wa.me`, `api.whatsapp.com/send`, `web.whatsapp.com/send` and `whatsapp://send` on the page, in `<a>` and `<area>` elements.
- The number is digits 0 to 9 only: no `+`, spaces, dashes or brackets, and no Eastern Arabic digits such as ٩٦٨.
- The number does not start with a zero, and is a full international number: a known country code and a length that fits that country's numbers.
- The local 0 after the country code, as in `9660501234567`, with the right form `966501234567`.

## Example

### Wrong

```html
<a href="https://wa.me/+968 9123 4567">Message us on WhatsApp</a>
```

### Right

```html
<a href="https://wa.me/96891234567">Message us on WhatsApp</a>
```

## How to fix

Write the full international number, digits only: the country code, then the number without its local 0.

```html
<!-- Saudi local number: 050 123 4567 -->
<a href="https://wa.me/966501234567">Message us on WhatsApp</a>
```

- Gulf country codes: Saudi Arabia `966`, UAE `971`, Oman `968`, Kuwait `965`, Bahrain `973`, Qatar `974`.
- For a prefilled message, add `?text=` with URL-encoded text, such as `https://wa.me/96891234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7` ("مرحبا", hello).
- With `api.whatsapp.com/send?phone=` links, the same applies to the `phone` value.

## FAQ

### Do I put a + before the number?

No. WhatsApp documents chat links with the full international number in digits only: no `+`, no leading zeros, no brackets or dashes.

### My number starts with 05. How do I write it?

Drop the local 0 and put the country code in front: the Saudi number `0501234567` becomes `966501234567`.

### Does the tool check that the number has a WhatsApp account?

No. We check the number's format and length only, because checking the account would mean contacting WhatsApp.

## Methodology

We fetch the page with one request as `ArablyzerBot` and read its links in the HTML as the server sends it, before any JavaScript runs. For every WhatsApp link with a number, we decode the number and check, in order: Eastern Arabic or Persian digits, then any character other than 0–9, then a leading zero. Then we check that it is a possible international number, using the phone numbering data of the libphonenumber-js library, which is based on Google's data. Links without a number, such as `wa.me/message/…`, are not checked.
