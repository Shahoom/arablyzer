# noindex

noindex is a rule you set in a meta tag or an HTTP header to ask search engines not to show a page in their results. It only works if the crawler can read it.

## Definition

- `noindex` is a rule that keeps search engines that support it, Google among them, from indexing a page: when Googlebot finds it, Google drops the page from search results entirely, even if other sites link to it.
- Set it in a `<meta name="robots" content="noindex">` tag in the page's `<head>`, or in an `X-Robots-Tag: noindex` response header, which also works for PDFs and images. Google does not support it in robots.txt.

## Why it matters

- It is what Google recommends to keep a page out of its results, rather than robots.txt, which can leave the URL indexed. It suits pages such as internal search results or a "thank you for your order" page.
- It only works if Google sees it: the page must not be blocked in robots.txt, and the crawler must be able to reach it.
- It takes effect only when Googlebot crawls the page again, which can take months for some pages, depending on their importance. You can ask for a recrawl in the URL Inspection tool.

## Example

An internal search results page, with a tag in its `<head>`:

```html
<!-- On https://example.com/بحث?q=عود -->
<meta name="robots" content="noindex">
```

And a PDF you do not want in results, with a header in the server's response:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
X-Robots-Tag: noindex
```

## Common mistakes

- `noindex` on a page that is also blocked in robots.txt: Google never sees the rule, and the page may stay in results if other pages link to it.
- A rule left over from the development site or a CMS setting: Search Console's Page indexing report lists the pages where Googlebot found `noindex`.
- Removing `noindex` with JavaScript: Google may skip running JavaScript on a page whose original code has it, so it never sees the removal.
- Expecting `noindex` to stop links on the page from being followed: that is `nofollow`, and `none` means both.

## References

- [Google Search Central: Block Search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google Search Central: Robots meta tag, data-nosnippet, and X-Robots-Tag specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Google Search Central: Understand the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
