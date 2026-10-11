# Page of a list has a canonical address that is not itself

## Messages

### canonical-elsewhere

This is a later page of a list (page {page}), but its canonical address is {canonical}, not itself.

## Why it matters

- A category or search result with many products is split into pages. If page 2, 3 and 4 all name page 1 as their canonical, Google takes them for copies of the first page and may not index them, and the products that only they link to are reached less often, or never.
- Google no longer uses `rel="prev"` and `rel="next"` to understand a series. It reads each page on its own, so each page needs its own canonical address.
- Store themes and SEO plugins do it by default for "duplicate content", which is a mistake for pages of a list: they are different content.

## How to fix

Give every page of the list a canonical address that is itself, the first page included:

```html
<link rel="canonical" href="https://shop.example/oud?page=2" />
```

- Do not point later pages at the first page, or at the category.
- Keep pages crawlable by plain links (`<a href="?page=3">`) and avoid hiding them behind a "load more" button that has no address.
- If page 1 is also reached at an address with `?page=1`, redirect it to the address without.
- In an SEO plugin, turn off "canonical to the first page" or "paginated pages canonical to the archive".

## How we detect

1. A page is a later page of a list when its address holds a page number of 2 or more (`?page=2`, `?paged=2`, `?p=2`, `?pg=2`, `/page/2/`) or when it has a `rel="prev"` link.
2. If it has a canonical link and that address is not the page's own (the query and the fragment aside), it is flagged.
3. A later page without a canonical, or with its own, passes.

## References

- [Google Search Central: Pagination and incremental page loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google Search Central: Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
