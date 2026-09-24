# The page blocks search indexing (noindex)

## Messages

### meta

`<meta name="{name}" content="{content}">` asks for this page not to be indexed by search engines.

### header

The `X-Robots-Tag: {value}` header asks for this page not to be indexed by search engines.

## Why it matters

- The `noindex` rule makes Google drop the page from search results entirely, even when other sites link to it. `none` means `noindex` together with `nofollow`.
- It can be left over from the development version or come from a content-management setting, such as the "Search engine visibility" option in WordPress's reading settings, which adds `noindex` to every page.
- The `X-Robots-Tag` header does not show in the page's source, so it can go unnoticed, and it also applies to other files such as PDFs.
- If you mean to hide the page, such as a "thank you for your order" page or internal search results, this finding needs no fix.

## How to fix

Remove `noindex` and `none` where they come from:

```html
<!-- Remove this tag, or keep only its other rules -->
<meta name="robots" content="noindex, follow" />
```

- When it comes from the header, look in the server configuration: `Header set X-Robots-Tag` in Apache, `add_header X-Robots-Tag` in nginx, or your CDN's settings.
- In WordPress, untick "Discourage search engines from indexing this site" under "Settings → Reading", and check the SEO plugin's settings for the page itself.
- For Google to see the change, the page must not be blocked in robots.txt, because Google does not read pages it may not crawl.

## How we detect

1. We check pages that answered with a 2xx status only, whether HTML or other files.
2. In HTML we read `<meta>` tags named `robots` or `googlebot`, in any letter case, split their rules on commas, and look for `noindex` or `none`.
3. We read every `X-Robots-Tag` header in the response. A rule preceded by a crawler prefix, such as `googlebot: noindex`, only counts when the crawler is Googlebot; rules for other crawlers, such as `otherbot: noindex`, are ignored.
4. Each source is its own finding, quoting the value as received.

## References

- [Google: Block search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: Robots meta tag, data-nosnippet, and X-Robots-Tag specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
