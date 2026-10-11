---
summary: Do your store's WhatsApp buttons open the right number with the Arabic message ready, not %D9%85… or broken letters?
---

# WhatsApp order button checker

Reads the WhatsApp links of a store page, the "order on WhatsApp" and "ask about this product" buttons, and checks both halves: the number in international format for its country, and the ready-made Arabic message, encoded once as UTF-8, with nothing cut off.

## What it checks

- That the number is digits only in international format, with the country code and without a plus, a leading zero, or Eastern Arabic digits.
- That the message (`text=`) is encoded once, as UTF-8: not twice (%25D9…), not in Windows-1256, and with no stray `%`.
- That a `#` in an order number does not end the link and drop the rest of the message.
- That the message arrives as Arabic and not garbled, and that no template placeholder such as `{{product_name}}` was left in.

## Example

### Wrong

```html
<a href="https://wa.me/0501234567?text=%25D9%2585%25D8%25B1%25D8%25AD%25D8%25A8%25D8%25A7">اطلب عبر واتساب</a>
```

### Right

```html
<a href="https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7">اطلب عبر واتساب</a>
```

## How to fix

1. Write the number as `country code + number without its local 0`: `966501234567` for a Saudi mobile, `96891234567` for an Omani one.
2. Encode the message once, as UTF-8, with `encodeURIComponent`, `rawurlencode` or the platform's URL-encode filter, and put it after `?text=`.
3. Write `#` as `%23`, `&` as `%26`, a space as `%20`, a new line as `%0A`.
4. For a product button, build the message from the product's name on the server, encoded once; do not leave the placeholder for the browser.
5. Open the button on a phone and read the chat box: it should show the Arabic message, the number's account and nothing else.

## FAQ

### What is the difference from the WhatsApp link checker?

That tool checks the number alone. This one checks the number and the ready-made message, which is where Arabic stores go wrong most: encoding.

### Why does my button work on my computer and not on phones?

Desktop browsers and WhatsApp Web repair some malformed links and phones do not. The links this tool reports are those that fail somewhere, even if not everywhere.

### Does it open my WhatsApp links?

No. It reads the links in your page's HTML and checks their form. It never contacts WhatsApp, and it cannot tell if the number has an account.

### My link is written by a plugin. How do I fix it?

Open the plugin's settings for the message and enter the text in plain Arabic; the plugin should encode it. If it shows the encoded text, it is encoding it twice or not at all; try a different plugin or the generator.

## Methodology

We find the WhatsApp links in the page's HTML (`wa.me`, `api.whatsapp.com/send`, `web.whatsapp.com/send`, `whatsapp://send`) and check the number with libphonenumber's data, as the link-format rule does. The message is read as written in the link: a raw `#` ends it, `%25` and two hexadecimal digits mean it was encoded twice, escapes that are not valid UTF-8 are reported, and the decoded message is read for garbled Arabic and unfilled placeholders. See each rule's page for the details.
