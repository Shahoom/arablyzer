# The hreflang links of a page are not a valid set

## Messages

### relative-url

The hreflang link for {hreflang} gives a relative address (“{href}”); Google needs a full address with its scheme, such as `https://shop.example/sa/`.

### self-missing

The page does not list itself among its hreflang links: none of them is its own address, {address}.

### duplicate-code

The language {hreflang} is given {count} different addresses; each language or region has one.

## Why it matters

- Google uses hreflang to show each visitor the version of a page made for their language and country: ar-SA for Saudi Arabia, ar-AE for the UAE. It asks that every version lists all the versions, itself included, with full addresses.
- A relative address is not read as a version. A page that leaves itself out of the list weakens the set: Google may ignore the annotations it cannot confirm.
- Two addresses for one language leave Google to choose, so the version a visitor gets can be the wrong one.
- Stores with a version for each Gulf country meet these most: the theme writes the links, and a currency or country switch can leave one half out.

## How to fix

Give every version the same complete list, with full addresses, including the page's own:

```html
<link rel="alternate" hreflang="ar-SA" href="https://shop.example/sa/offers" />
<link rel="alternate" hreflang="ar-AE" href="https://shop.example/ae/offers" />
<link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
<link rel="alternate" hreflang="x-default" href="https://shop.example/offers" />
```

- Write the scheme and the host in every `href`, not a path.
- Make the page's own entry equal its canonical address.
- Keep one address for each language or region code; if two pages cover one market, choose one as the version and canonicalise the other.
- In Salla, Zid and Shopify the store's language and market settings produce the links; check that each market has its own address and that the theme prints full addresses.

## How we detect

1. We read the `<link rel="alternate" hreflang>` elements in the HTML (the Link header is read by the rule about codes).
2. An address is relative unless it starts with a scheme (`https:`).
3. The page's identity is its canonical address, or its own address when it has none, compared by scheme, host and path (the query, the fragment, a trailing slash and the letter case of the host are ignored). If none of the links is on the page's host, the scan cannot tell which entry the page is (it may be fetched through another name), and does not judge that; otherwise the page must be one of them.
4. Two links with the same code in any letter case and different addresses are a duplicate.

The scan does not request the other versions, so it cannot check that they link back (return links). That check needs a crawl.

## References

- [Google Search Central: Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [RFC 8288: Web Linking](https://www.rfc-editor.org/rfc/rfc8288)
