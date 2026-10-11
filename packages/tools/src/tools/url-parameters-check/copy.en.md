---
summary: Do your own links carry utm_, fbclid or session parameters that make a copy of every page?
---

# URL parameters checker

Reads the links on a page to its own site and finds those that carry a tracking parameter (`utm_source`, `fbclid`, `gclid`) or a session identifier (`PHPSESSID`, `jsessionid`): each one is another address for the same page.

## What it checks

- Links to the page's own site with tracking parameters: `utm_*`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `mc_cid` and a few more.
- Links with a session identifier: `PHPSESSID`, `jsessionid`, `sid`, `sessionid`, `cfid`, `cftoken`.
- Whether the page itself, reached with such parameters, has a canonical address that drops them.
- Parameters that change what the page shows, such as `sort` or `color`, are left alone.

## Example

### Wrong

```html
<a href="/?utm_source=banner&amp;utm_medium=home">عروض الأسبوع</a>
<a href="/?utm_source=banner&amp;utm_medium=footer">عروض الشهر</a>
<a href="/?PHPSESSID=7f3a9c1d">حسابي</a>
```

### Right

```html
<a href="/">عروض الأسبوع</a>
<a href="/?sort=price">الأقل سعراً</a>
<a href="https://partner.example.net/?utm_source=site">شريكنا</a>
```

## How to fix

1. Take the parameters out of the site's own links. A banner points to the page, and the click is tracked with an event or a data attribute.
2. Keep `utm_` for links in emails, ads and other people's sites.
3. Remove the session from the address and keep it in a cookie; if the platform adds `PHPSESSID` or `jsessionid`, turn off URL rewriting for sessions.
4. Give each page a canonical address without the parameters, so visits that arrive with them are folded into the page.
5. In the store's apps, find the banner, popup or email-capture app that adds the parameter to its links; it is usually a setting.

## FAQ

### Why not use UTM parameters on internal links?

Because they tell Google Analytics that the visitor arrived from a new campaign: the session restarts and the real source (search, an ad) is replaced by your own banner. Track internal banners with events.

### Does a parameter on a link hurt my ranking?

Not by itself. Google folds duplicates it can recognise, but every address it must decide on costs a crawl, and it may choose the wrong one. Clean links make that choice unnecessary.

### My filter links have parameters (`?color=red`). Are those a problem?

Not for this check: they change what the page shows. Faceted navigation has its own questions, which the canonical and robots.txt answer.

### Does it check the other pages of my site?

No, only the page you give. Run it on your home page and a product page: themes repeat the same links on every page.

## Methodology

We read the links of the page in its HTML as the server sends it and keep those to the same registered domain (www aside). A parameter is tracking or session when it is in our list; the list is short and follows what analytics tools and platforms add. See the rule's page for the details.
