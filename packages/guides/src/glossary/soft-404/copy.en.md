# Soft 404

A soft 404 is a page that tells visitors it does not exist, or shows up empty, while its server answers 200: Google leaves it out of Search and Search Console reports it.

## Definition

- A `soft 404` is a URL that returns a page telling the user the page does not exist, together with a `200` (success) status code. It can also be a page with no main content, or an empty page.
- When Google's algorithms conclude from its content that a page is an error page, Search Console reports it in the Page indexing report as "Soft 404". Causes Google lists include a broken connection to the database, an empty internal search results page, and a JavaScript file that did not load.

## Why it matters

- Visitors see an error on a page whose status says it works, which Google calls a bad user experience, and the page is excluded from Search.
- Google keeps crawling soft 404 pages, so they use up your site's crawl budget.

## Example

A removed product's page shows "Sorry, this product does not exist" while the server answers `200`:

```text
$ curl -I https://example.com/ar/products/old-oud
HTTP/2 200
```

The fix depends on the case:

1. Removed, with no replacement: answer `404` or `410`.
2. Moved, or clearly replaced: redirect to it with a permanent `301`.
3. Still there and sound: check it in the URL Inspection tool; Googlebot may not have rendered it properly, or it may lack resources blocked by robots.txt.

## Common mistakes

- A custom 404 page served with `200`: the page is for visitors, and the `404` code keeps it out of the index.
- A single-page app that shows "not found" through JavaScript while the server answers `200`: Google suggests a JavaScript redirect to a URL that answers `404`, or adding `noindex` to the error page.
- A sound page that Google sees blank or nearly blank because its resources are blocked by robots.txt, too many or too slow, and treats as a soft 404.

## References

- [Google Search Central: Troubleshoot Google Search crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors#soft-404-errors)
- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google: Optimize your crawl budget](https://developers.google.com/crawling/docs/crawl-budget)
- [Google Search Central: Understand the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
