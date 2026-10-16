# Links to the site carry tracking or session parameters

## Messages

### tracking

{count} links on the page carry the tracking parameter `{param}` (the first is {href}).

### session

{count} links on the page carry the session parameter `{param}` (the first is {href}).

### own-url

This page was reached with {params}, and its canonical address ({canonical}) keeps them or is missing.

## Why it matters

- Each link with `?utm_source=…` is another address for the same page. Crawlers meet the copies and spend their visit on them, and Google must decide which one to index.
- A tracking parameter on an internal link tells an analytics tool that the visitor came from "outside": the visit starts over and the true source is lost. Google Analytics' guidance is not to tag a site's own links.
- A session identifier in a link gives every visitor an address of their own: no two crawls find the same page, and a shared link carries someone's session.
- Marketing links are meant to carry tracking; the problem is a site's own pages carrying it in their menu, banners and footers.

## How to fix

- Remove the parameters from the site's own links: the banner at `/offers`, not `/offers?utm_source=banner`. Track a click on an internal banner with an event or a data attribute, not a campaign parameter.
- Keep `utm_` parameters for links in emails, ads and other sites.
- Never put the session in the address: use a cookie. If the platform adds `PHPSESSID` or `jsessionid`, disable URL rewriting for sessions.
- Give every page a canonical address without the parameters, so a visit that arrives with them is folded into the page.

```html
<link rel="canonical" href="https://shop.example/offers" />
```

## How we detect

1. We read the page's links to its own site (the same registered domain, `www` aside).
2. A link is flagged for a parameter in our list of tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `mc_cid`, `_ga`, `_gl` and a few more) or of session ones (`PHPSESSID`, `jsessionid`, `sid`, `sessionid`, `cfid`, `cftoken`). Parameters that change what the page shows, such as `sort`, `page` or `color`, are not.
3. If the page itself was reached with such a parameter, the finding says so when its canonical address keeps the parameter or is missing.
4. One finding for each parameter, with how many links and the first.

## References

- [Google Search Central: Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Analytics Help: Collect campaign data with custom URLs](https://support.google.com/analytics/answer/1033863)
