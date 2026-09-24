# WhatsApp link number not in international format

## Messages

### arabic-digits

The WhatsApp link number "{number}" is written in Eastern Arabic digits; WhatsApp needs the digits 0–9.

### not-digits-only

The WhatsApp link number "{number}" contains characters other than digits, such as +, spaces or dashes.

### leading-zero

The WhatsApp link number "{number}" starts with 0; write it in full international format, starting with the country code.

### not-international

The WhatsApp link number "{number}" is not a complete international number; it probably lacks the country code.

### trunk-zero

The WhatsApp link number "{number}" keeps the local 0 after the country code; the correct number is {suggestion}.

## Why it matters

- The "message us on WhatsApp" button is a main contact route on Gulf websites; when it does not work, the customer does not reach you, and you may never know they tried.
- WhatsApp documents one format for chat links: the full international number, digits only, without a plus sign, leading zeros, brackets or dashes.
- Links in other forms are not guaranteed to work: depending on the form and the app, WhatsApp may show an error or fail to find the account.

## How to fix

Write the full international number, digits only: the country code, then the number without its local 0.

```html
<!-- Omani local number: 9123 4567 -->
<a href="https://wa.me/96891234567">Message us on WhatsApp</a>

<!-- Saudi local number: 050 123 4567 → 966 then 501234567 -->
<a href="https://wa.me/966501234567">Message us on WhatsApp</a>
```

- Gulf country codes: Saudi Arabia `966`, UAE `971`, Oman `968`, Kuwait `965`, Bahrain `973`, Qatar `974`.
- For a prefilled message, add `?text=` with URL-encoded text, such as `https://wa.me/96891234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7` ("مرحبا", hello).
- With `api.whatsapp.com/send?phone=` links, the same rule applies to the `phone` value.

## How we detect

1. We collect the page's links (`<a>` and `<area>`) to `wa.me/<number>`, `wa.me/c/<number>`, `api.whatsapp.com/send?phone=`, `web.whatsapp.com/send?phone=` or `whatsapp://send?phone=`. Links without a number, such as `wa.me/message/…`, are not checked.
2. We decode the number and check, in order: Eastern Arabic or Persian digits, then any character other than 0–9, then a leading zero.
3. We check that it is a possible international number: a known country code and a length that fits that country's numbers, using the numbering-plan data of the libphonenumber-js library, which is based on Google's data.
4. When the local 0 follows the country code (such as `9660501234567`), we give the correct form.

We do not check whether the number has a WhatsApp account, because that would mean contacting WhatsApp.

## References

- [WhatsApp Help Center: How to use click to chat](https://faq.whatsapp.com/5913398998672934/)
- [WhatsApp Help Center: About international phone number format](https://faq.whatsapp.com/1294841057948784)
- [ITU-T E.164: The international public telecommunication numbering plan](https://www.itu.int/rec/T-REC-E.164)
