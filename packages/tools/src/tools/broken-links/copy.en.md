---
summary: Do any of your page's links to your own site answer with an error?
---

# Broken link checker

Asks for every link on your page to your own site's pages, and tells you which answer with an error such as 404 or 500, without crawling the rest of the site or asking other sites for anything.

## What it checks

- The `<a href>` and `<area href>` links in the page's HTML to its own origin, that is the same scheme, name and port: the first 50 of them, each address once.
- What each link answers: we ask with `HEAD`, then with `GET` when it answers an error or the connection fails, as a visitor's browser asks. We follow no redirect, so a redirect is a sound answer for us.
- A link counts as broken when it answers a status from `400` to `599`, except `401`, `403`, `407`, `429` and `503`, which sites also give a visitor they take for a bot. Those five, a timeout and a failed connection are not judged, and the report counts them.

## Example

### Wrong

```html
<a href="/ar/ofers/">العروض</a>
```

### Right

```html
<a href="/ar/offers/">العروض</a>
```

## How to fix

Correct the address in the link, or restore the page it leads to. If the page has moved to a new address, send its old address there with a permanent redirect, so every old link to it works. In nginx:

```nginx
location = /ar/ofers/ {
    return 301 /ar/offers/;
}
```

- In Apache (mod_alias): `Redirect permanent /ar/ofers/ /ar/offers/`.
- Remove links to pages that are gone for good.
- If the error is a `5xx`, the fault is in the server: look for it in its error logs, then check the page again.

## FAQ

### Does it check links to other sites?

No. The check asks for links to your page's own origin alone, and asks nothing of another site, nor of another name of your domain such as `www`: it stays on the site you asked it to check.

### Why does it not check every page of my site?

Because it checks the links of the page you give it alone, the first 50, and crawls none of the pages they lead to. Check your other pages one at a time, the ones your visitors use most first.

### Why does the check say it left some links unchecked?

For one of these reasons: the page has more than 50 links to its site, your site's robots.txt asks `ArablyzerBot` not to check their path, they did not answer in time or the connection failed, or your site refused the request with `401`, `403`, `407`, `429` or `503`, as sites answer a visitor they take for a bot, so the check says nothing of the link. After the first `429` we ask for no more links. The report counts each, and counts none of them as broken.

### Does it see links that JavaScript adds?

No. It reads the links in the page's HTML as the server sends it, before JavaScript runs. A link a script builds after loading is not seen.

## Methodology

We fetch the page as `ArablyzerBot` and follow its redirects, having read its site's robots.txt first. We then gather the `<a href>` and `<area href>` links from the HTML as the server sends it, complete them against the page's base address, and keep those that lead to the page's own origin, without what follows `#`, and without the page itself or addresses with a user name or password. We ask for the first 50 that robots.txt does not keep from `ArablyzerBot`, four at a time, within 20 seconds at most: each with `HEAD`, then with `GET` when it answers an error or the connection fails, following no redirect and reading no content. Every request goes through the egress proxy, which refuses private addresses and the server's own. A link fails when it answers a status from `400` to `599`, except `401`, `403`, `407`, `429` and `503`, and what got no answer is not judged. After the first `429`, we ask for no more links. The same site, with the same answers, gives the same result every time.
