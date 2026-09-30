# “Soft 404” in Search Console: what it means and how to fix it

What the Page indexing report means by “Soft 404”: a page that tells visitors it does not exist yet answers 200, and how to fix it for each case.

## What it means

- The server answered the page with `200`, meaning the request succeeded, but Google saw an error page in its content: a message that the page does not exist, an empty page, or a page without main content.
- Google excludes such pages from search results.
- The page may really be gone and should answer `404`, or it may exist while Googlebot did not see it as visitors do.

## Why it shows

Your web server, content management system or the visitor’s browser can produce such a page for various reasons; Google names these:

- A missing server-side include file.
- A broken connection to the database.
- An empty internal search result page.
- A JavaScript file that did not load or is missing.

Other common causes:

- A deleted page for which the site shows a “page not found” template, while the server answers `200` with it.
- Redirecting deleted URLs to the home page instead of answering `404`.
- A single-page app (SPA) that shows its error page with JavaScript, while the server answers `200` for every URL.
- Resources Googlebot cannot load, because they are blocked in robots.txt, slow or too many, so the page looks blank or nearly blank to it.

## How to fix

The fix depends on the page:

- It is gone with no replacement: make the server answer `404` or `410`. You can design a helpful `404` page for visitors, in your site’s look and with its links, as long as the server answers `404` with it.
- It moved or has a clear replacement: redirect it with a `301` to its new URL.
- It exists and its content is fine: open it in the URL Inspection tool, look at the page as Google rendered it, and fix what keeps Google from seeing the content, such as resources blocked in robots.txt or an error message shown during rendering.

In single-page apps, where the server can hardly answer the right code, send visitors from the error page with JavaScript to a URL the server answers with `404`, or add `noindex` to the error page:

```js
if (!product.exists) {
  // No product at this URL: send the visitor to a URL the server answers with 404
  window.location.href = '/not-found'
}
```

## How to check the fix

- Request the URL and read its status code, for example with `curl -I`: a deleted page should answer `404` or `410`, and a moved one `301`.
- In Search Console, open the URL Inspection tool, test the live URL, then view the tested page to see its screenshot as Google rendered it, and the HTTP code it received.
- Then choose “Validate fix” in the Page indexing report, so Google checks the affected pages again.

## FAQ

### Should I redirect deleted pages to the home page?

No. Google says redirecting visitors to another page, such as the home page, instead of answering `404` can be a problem, and calls such pages soft 404s. Redirect a URL only to a clear replacement, and let what has none answer `404` or `410`.

### Why does Google flag a good page as a soft 404?

Most likely it did not load properly for Googlebot: critical resources did not load, or a prominent error message showed while the page rendered. If the screenshot shows a blank or nearly blank page, look for resources that are blocked in robots.txt, too many, slow, or answering with server errors.

### Do soft 404 pages hurt my site?

These pages are excluded from search results, and Google says exposing many URLs you do not want crawled, soft 404 pages among them, can hurt a site’s crawling and indexing. So make every page that does not exist answer `404`.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Soft 404 errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors#soft-404-errors)
- [Search Console Help: 404 errors](https://support.google.com/webmasters/answer/2445990)
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
