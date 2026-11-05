---
summary: Turn an Arabic or English title into a clean slug for your page's address.
---

# Arabic slug generator

Turns a page title, in Arabic or English, into the last part of its address: the harakat and tatweel taken out, Eastern Arabic digits turned into 0–9, words joined by one hyphen, and the length kept within what Arablyzer's own slug check passes.

## What it checks

- Harakat, the superscript alef and tatweel: taken out, because a word with them and without them is two addresses.
- Eastern Arabic and Persian digits: written as `0` to `9`.
- Spaces, underscores, punctuation and capital Latin letters: replaced by one hyphen or lowercased.
- Length: a slug over 100 characters stops at the last whole word that fits.
- The result is judged by the same check Arablyzer runs on pages (`url-slug-invalid`), and shown as you type it in the address bar and as it is sent, percent-encoded.

## Example

### Wrong

```html
<link rel="canonical" href="https://example.com/products/%D9%82%D9%8E%D9%87%D9%88%D8%A9_%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-%D9%A2%D9%A0%D9%A2%D9%A6" />
```

### Right

```html
<link rel="canonical" href="https://example.com/products/%D9%82%D9%87%D9%88%D8%A9-%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-2026" />
```

## How to fix

Type the title, copy the slug, and put it in the page's address field, then use the same address in the canonical:

```html
<link rel="canonical" href="https://example.com/products/قهوة-عربية-2026" />
```

- On Salla, Zid and Shopify the slug is a field of the product or page, next to its SEO title. Paste the slug there.
- In WordPress it is the _Slug_ field in the page's settings; paste the slug before you publish.
- If the page already has an address that ranks, do not replace it only to tidy it: set a 301 redirect from the old address to the new one first.
- Keep the slug short, a few words that name the page, and keep it stable once the page is published.

## FAQ

### Should I write the slug in Arabic or in English letters?

Both work. Google reads Arabic addresses, and an Arabic slug tells an Arabic reader what the page is before they click. Browsers show it in Arabic and send it percent-encoded. An English slug is shorter to share in some apps. Pick one and keep it the same across the site.

### Why take out the harakat?

A word with a fatha and the same word without it are two different addresses to a crawler, and nobody types the harakat when they copy an address by hand. So the same page can be reached by two addresses, and one of them can answer with an error.

### Why does the slug I copy look like a long line of percent signs?

That is the same slug as it is sent: each Arabic letter becomes six characters. Browsers and Google show and read it as Arabic. Paste the first form in your page's address field, and use the encoded form only where a system asks for it.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser, with the same slug check that Arablyzer runs on pages (`url-slug-invalid`). We normalise the title (NFC), take out the harakat, the superscript alef and tatweel, turn Eastern Arabic and Persian digits into 0–9, lowercase it, and join the letters and digits of any script with a single hyphen. A slug of more than 100 characters stops at the last whole word that fits. The 100 characters are Arablyzer's own threshold: Google gives no number, and asks for simple, readable addresses.
