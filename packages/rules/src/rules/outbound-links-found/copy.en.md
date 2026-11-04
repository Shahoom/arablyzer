# Sites this page links to

## Messages

### site

The page links to {site} {count} times: {followed} followed, {nofollow} with `nofollow`, {sponsored} with `sponsored` and {ugc} with `ugc`.

## Why it matters

- Where a page sends readers is part of what it says. A list of the sites you link to shows whether you point to sources you trust, and whether a link that was paid for is marked as paid.
- Google asks that paid and advertising links carry `rel="sponsored"` (or `nofollow`), and links in comments and forum posts `rel="ugc"`. Links that pass ranking by payment are against its link spam policies.
- A link to a site that has gone away or turned bad costs the page that links to it. The list is where you start to check.
- This is information only: linking out is part of the web, and nothing here counts against a score.

## How to fix

There is nothing to fix. Read the list and decide, for each site, whether the page should link to it and how:

```html
<a href="https://www.example.org/guide">دليل التحميص</a>
<a href="https://shop.example.net/offer" rel="sponsored nofollow">عرض الشريك</a>
```

- Mark a link you were paid or given something for with `rel="sponsored"`.
- Mark links added by visitors (comments, reviews) with `rel="ugc"`.
- Remove or replace links to sites you no longer stand behind.
- Keep the other links plain: linking to good sources helps readers.

## How we detect

1. We take the links of the page's HTML whose address is http or https and whose site is not the page's own (a subdomain of the same site is the same site).
2. For each other site we count its links, and how many carry `nofollow`, `sponsored` and `ugc` in their `rel`.
3. The biggest 30 sites are listed, in order of links.
4. Links from a script are not seen: the page is read as its server sent it.

## References

- [Google Search Central: qualify your outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)
