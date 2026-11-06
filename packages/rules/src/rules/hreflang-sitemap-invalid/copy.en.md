# Language versions in the sitemap are not complete

## Messages

### no-self

{count} pages of the sitemap {sitemap} list language versions but not themselves, such as {url}.

### no-return

{count} pages of the sitemap {sitemap} list a version that does not list them back, such as {url} (it lists {alternate}).

### bad-code

{count} language codes in the sitemap {sitemap} are not ones Google accepts, such as «{code}» on {url}.

### relative

{count} versions in the sitemap {sitemap} are not full addresses, such as «{alternate}» on {url}.

## Why it matters

- A sitemap can give Google the language versions of a page with `xhtml:link` elements. Google asks that each page list all its versions, itself included, and that every version list the others: if one page does not list the other back, Google may ignore the pair.
- A language or region code Google does not accept (`ara`, `en-UK`, `ar_SA`) is skipped, and that version is not matched.
- A version must be a full address with `https://`, as a sitemap gives them all.

## How to fix

Give every page of a group the same list, each with its own address in it:

```html
<url>
  <loc>https://shop.example/ar/oud</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
</url>
<url>
  <loc>https://shop.example/en/oud</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
</url>
```

- Declare the `xhtml` namespace on the `urlset` (`xmlns:xhtml="http://www.w3.org/1999/xhtml"`).
- Use the codes the hreflang generator writes: `ar`, `ar-SA`, `en`, `en-GB` and `x-default`.
- Write full addresses, the same ones as the `loc` of the pages they point to.
- Use hreflang in the sitemap or in the pages, not both with different answers.

## How we detect

1. We read the sitemaps the scan fetched that are a `urlset`, the first 5,000 entries of each, and the `xhtml:link` elements with `rel="alternate"` and an `hreflang` in them.
2. The `no-self` message: a page that lists alternates but none is its own address.
3. The `no-return` message: a page lists a version which is itself an entry of the same file, and that entry does not list the page. A version that is not in this file may be in another sitemap and is not judged.
4. The `bad-code` message uses the same check as the hreflang code check on pages; the `relative` message is an address that does not begin with http:// or https://.
5. One finding for each message and sitemap, with how many and the first.

## References

- [Google Search Central: localized versions in a sitemap](https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap)
