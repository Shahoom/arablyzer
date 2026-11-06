---
summary: Paste a Search Console or Merchant Center message and see what it means.
---

# Search Console and Merchant Center error decoder

Paste a message from Google Search Console or Merchant Center, in Arabic or English, and get what it means, its usual cause and the steps to fix it, with a link to the Arablyzer tool that checks the same thing on your page. It knows the page indexing, sitemap, structured data, product feed and Core Web Vitals messages.

## What it checks

- The page indexing statuses: «Crawled – currently not indexed», «Discovered – currently not indexed», the duplicate and canonical messages, `noindex`, robots.txt blocks, soft 404, 404, redirects and server errors.
- The sitemap messages: an address in the sitemap that is a 404, a `noindex` page or blocked, and a sitemap that cannot be read.
- Structured data messages: a missing field or an invalid value, such as a price written with a symbol or Arabic digits.
- Merchant Center messages: price or availability that differs from the page, a missing image, an invalid GTIN, a landing page that does not work.
- Core Web Vitals messages: LCP, CLS and INP.
- It reads Google's wording in English and the stems of the Arabic interface's; a message it does not know gets the list of those it does.

## Example

### Wrong

```html
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://example.com/">
```

### Right

```html
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://example.com/">
```

## How to fix

Most messages come down to one of a few causes. Read the message, find the cause here, and fix it where the page is made:

```html
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://example.com/">
```

- «Excluded by 'noindex' tag»: remove the `noindex` from the page's robots meta tag and from the `X-Robots-Tag` header, then ask Search Console to inspect the address again.
- «Duplicate…» and canonical messages: make each page's canonical the address you want in search, and make your links, sitemap and redirects name the same one.
- «Crawled – currently not indexed»: the page is not broken; give it content and links that make it worth indexing.
- Merchant Center price and availability messages: fix them in the feed, where the platform exports the product.
- After a fix, use the “validate fix” button in Search Console, and wait: Google checks again over days, not minutes.

## FAQ

### My message is not in the list. What do I do?

Paste its heading as Search Console shows it. If we do not know it, the tool lists the ones it does. Google's own help page for the report explains the rest.

### Does “crawled – currently not indexed” mean something is wrong with my page?

Not necessarily. It means Google fetched it and did not index it yet. The usual reasons are content that adds little, content close to another page, or too few links to it. Improve the page rather than asking for indexing again.

### Will fixing the message put my page in Google?

It removes the reason Google gave. Whether the page is shown, and where, depends on Google's own judgement of the page.

### Does what I paste reach Arablyzer?

No. The decoder runs in your browser, and nothing you paste leaves it.

## Methodology

The decoder runs in your browser. Each message of Search Console's page indexing, sitemap, structured data, Merchant Center and Core Web Vitals reports that we know is a patterns-and-text entry written from Google's help pages for those reports: the English wording and the stems of the Arabic interface's wording (with the marks and the spelling of ة and أ folded). A pasted message gets the entry whose pattern says most about it. The Arabic interface's exact words change between releases, so when nothing matches, we say so and list the messages we know. The two rules the page lists, `page-noindex` and `canonical-conflict`, are the checks behind the most common of them.
