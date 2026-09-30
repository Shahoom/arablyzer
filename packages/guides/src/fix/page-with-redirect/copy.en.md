# “Page with redirect” in Search Console: what it means and how to fix it

What the Page indexing report means by “Page with redirect”, why Google does not index URLs that redirect, and when a redirect needs fixing.

## What it means

- The URL redirects to another page, so Google treats it as a non-canonical URL and does not index it. The target of the redirect may or may not be indexed, depending on what Google thinks of it.
- This is usually expected: Google indexes the target of a redirect, not the URL that redirects. The old URLs of a page you moved show here, for example, or the `http` URLs of a site that moved to `https`.
- The problem is a URL you want in search that redirects by mistake, or a redirect that leads to the wrong page.

## Why it shows

Google knows the URL, from a link to it or a sitemap for example, and when it requests it, the server redirects it to another URL. Common redirects Google mentions:

- From `http` to `https`, or from one of several addresses of the same page to the one you chose.
- From an old URL to a new one, after changing a page’s address, merging two sites, or moving to a new domain.
- From a page you removed to a new page you want visitors to reach.

Google handles a redirect by its type:

- Permanent (`301` and `308`): Google uses it as a signal that the target should be the canonical, and shows the target in results.
- Temporary (`302`, `303` and `307`): Google does not use it as that signal, and shows the source URL in results.

## How to fix

There is usually nothing to fix. Review the redirect in these cases:

- You want the URL itself in search: remove the redirect rule, in the server’s settings, a plugin or the content delivery network (CDN).
- The move is permanent: use a server-side permanent redirect, `301` or `308`. Use a JavaScript redirect only if nothing else is possible: if rendering the page fails, Google may never see it.
- The redirect passes through other redirects: redirect straight to the final URL. Googlebot follows up to 10 hops, but Google advises redirecting to the final destination directly, and when you cannot, keeping the chain short, ideally no more than 3 hops.
- Many old URLs lead to one unrelated page, such as the home page: Google may treat that as a soft 404. Redirect each old URL to the page that replaces it.

Then update what points to the old URL: the links on your pages, the sitemap, `rel="canonical"` tags and `hreflang` links should name the final URL. A permanent redirect in the server’s settings:

```
# Apache: a permanent redirect to the new URL
Redirect permanent "/old" "https://example.com/new"

# nginx
location = /old {
  return 301 https://example.com/new;
}
```

## How to check the fix

- Check the URL with Arablyzer’s canonical checker: it follows the redirects and reads the page they end at, so you can confirm that page gives a single canonical URL.
- In the URL Inspection tool, the indexed result of a redirecting URL describes that URL itself, not its target. Inspect the target URL to see whether it is indexed.
- Google suggests the URL Inspection tool for testing redirects one URL at a time, and command-line tools or scripts for testing many.

## FAQ

### Should I use a 301 or a 302 redirect?

Use a permanent redirect (`301` or `308`) when the move is final: Google shows the target in its results. Use a temporary one (`302` or `307`) when you send visitors to another page for a while: Google is not influenced by it, which may help keep the old URL in its results. Google treats `308` like `301`, and `307` like `302`.

### How long should I keep a redirect?

As long as possible: Google says generally at least one year, so it can transfer all signals to the new URLs, including links from other sites to the old ones. From the users’ side, Google suggests considering keeping redirects indefinitely.

### Why does the old URL still show in results?

Google keeps track of both URLs, and the one it does not choose as the canonical becomes an alternate name of it. After a move to a new domain, Google may still show the old URLs now and then; this is normal, and it fades away without you doing anything.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google Search Central: How to move a site](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
