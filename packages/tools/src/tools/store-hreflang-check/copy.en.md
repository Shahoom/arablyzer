---
summary: Does your store tell Google which page is for Saudi Arabia, the UAE or Oman: codes, full addresses, itself and x-default?
---

# Store hreflang checker for the Gulf

Reads the hreflang links of a store page and checks them as a store with one version for each Gulf country needs them: valid codes (ar-SA, ar-AE, ar-OM), full addresses, the page listing itself, an `x-default` for everyone else, and a page whose `lang` agrees with the entry it lists itself with.

## What it checks

- That every code is one Google reads: a language, then an optional country, such as `ar-SA`, with a hyphen and not `ar_SA`, and `GB` and not `UK`.
- That every address is a full one with its scheme, the page lists itself, and no language has two addresses.
- That a page with two versions or more has an `x-default` for visitors from everywhere else.
- That the page's `<html lang>` agrees with the code it lists itself with, the language and the country.

## Example

### Wrong

```html
<html lang="ar-AE" dir="rtl">
  <head>
    <link rel="canonical" href="https://shop.example/sa/offers" />
    <link rel="alternate" hreflang="ar-KSA" href="/sa/offers" />
    <link rel="alternate" hreflang="ar-AE" href="https://shop.example/ae/offers" />
    <link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
  </head>
</html>
```

### Right

```html
<html lang="ar-SA" dir="rtl">
  <head>
    <link rel="canonical" href="https://shop.example/sa/offers" />
    <link rel="alternate" hreflang="ar-SA" href="https://shop.example/sa/offers" />
    <link rel="alternate" hreflang="ar-AE" href="https://shop.example/ae/offers" />
    <link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
    <link rel="alternate" hreflang="x-default" href="https://shop.example/offers" />
  </head>
</html>
```

## How to fix

Every version must carry the same complete list, itself included. In a store this list comes from the market and language settings:

1. Give each market its own address (a folder `/sa/`, a sub-domain or a domain), and not a currency switch on one address: a cookie or a script cannot be crawled as a version.
2. Print full addresses starting with `https://`, in every version, with the codes `language-COUNTRY`: `ar-SA`, `ar-AE`, `ar-OM`, `ar-KW`, `en`.
3. Add `x-default` to the version meant for everyone else, or to a country-picker page.
4. Set each version's `<html lang>` to its language and country.
5. On Salla, Zid or Shopify, check the store's language and market settings first, then the theme's head; a theme that prints relative addresses needs an update.

## FAQ

### Do I need hreflang for a store with one language and one country?

No. hreflang is for pages that exist in more than one version. A single Arabic store for one country needs none, and the checker says nothing when the page has no hreflang links.

### Why Arabic for each country and not just `ar`?

Because the pages differ: currency, shipping, phone numbers and often dialect. `ar` alone is right for one Arabic version for all countries; a version for Saudi Arabia and another for the UAE need `ar-SA` and `ar-AE` so each country is shown its own.

### Does it check that the other versions link back?

No. That needs the other pages fetched, which this check does not do; it reads the page you give. Check each version with this tool: if every version lists the others and itself, the links return.

### Why does it not judge my page when I scan a staging address?

If none of the links is on the scanned host, the check cannot tell which entry the page is. It says nothing of that rather than guess. Scan the live address.

## Methodology

We read the `<link rel="alternate" hreflang>` elements and Link headers in the HTML as the server sends it. Codes follow Google's accepted forms: ISO 639-1 language, optional ISO 15924 script and ISO 3166-1 region. The page's own entry is found by its canonical address. Nothing but the page is requested. See each rule's page for the details.
