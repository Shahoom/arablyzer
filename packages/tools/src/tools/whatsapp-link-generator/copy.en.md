---
summary: Type your number the way you always do, and get a WhatsApp link in the international format WhatsApp opens.
---

# WhatsApp link generator

Writes a WhatsApp chat link and its HTML for you, with the full international number in digits only, as WhatsApp documents, and a first message if you want one.

## What it checks

- The number as you type it: with `+` or `00`, spaces and dashes, or Eastern Arabic digits such as `٩٦٨`, becomes digits 0 to 9 only.
- A local 0 at the start, as in `0501234567`: it is dropped, and the code of the country you choose goes in front.
- A 0 after the country code, as in `9660501234567`: it is dropped, and the number becomes `966501234567`.
- That the result is a possible international number: a known country code and a length that fits that country's numbers, with the check the `whatsapp-link-format` rule runs on pages.

## Example

### Wrong

```html
<a href="https://wa.me/0501234567">Message us on WhatsApp</a>
```

### Right

```html
<a href="https://wa.me/966501234567" target="_blank" rel="noopener">Message us on WhatsApp</a>
```

## How to fix

Choose the country and type the number as you know it, then copy the link or its code, and put it where the old link was on your page:

```html
<!-- Saudi local number 050 123 4567, with the first message "مرحباً" (hello) -->
<a href="https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B" target="_blank" rel="noopener">Message us on WhatsApp</a>
```

- If you write a first message, the generator adds it after `?text=`, URL-encoded: it shows typed in the chat, and the visitor sends it if they wish.
- The code opens the link in a new tab (`target="_blank"`), with `rel="noopener"` so that the new tab cannot control your page.
- If the link is on a button or an image, put the same link in its `href`.
- After the change, check your page with the WhatsApp link checker, to be sure of all its links.

## FAQ

### Does the number I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

### Why was the + removed from the number?

Because WhatsApp documents chat links with the full international number in digits only: no `+`, no leading zeros, no spaces or dashes.

### My number has its country code. Which country do I choose?

Choose "The number has its country code" and type it in full, with or without `+`. If you type it with its code while a country is chosen, the generator still recognises it.

### Does the generator check that the number has a WhatsApp account?

No. It checks the number's format and length only, because checking the account would mean contacting WhatsApp.

## Methodology

The generator runs in your browser, with the code the `whatsapp-link-format` rule checks links on pages with. We turn Eastern Arabic and Persian digits into 0–9, drop everything that is not a digit, then put the code of the country you chose in front of the number without its local 0, unless you typed it with `+` or `00`. Then we check that it is a possible international number, using the phone numbering data of the libphonenumber-js library, which is based on Google's data, and write the link: `https://wa.me/` and the number, with the first message encoded by `encodeURIComponent`.
