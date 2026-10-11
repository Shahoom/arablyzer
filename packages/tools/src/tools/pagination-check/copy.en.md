---
summary: Do the pages 2, 3 and 4 of your product lists have a canonical address of their own, or do they all point to page 1?
---

# Pagination checker

Reads a page of a product or article list and checks that its canonical address is itself. Pages that name the first page as their canonical are taken for copies of it, and the products only they link to may never be reached.

## What it checks

- Whether the page is a later page of a list: a page number of 2 or more in its address (`?page=2`, `/page/2/`), or a `rel="prev"` link.
- If it is, whether its canonical address is itself and not the first page or the category.
- A later page with no canonical, or with its own, passes.

## Example

### Wrong

```html
<link rel="prev" href="/page/1" />
<link rel="next" href="/page/3" />
<link rel="canonical" href="/page/1" />
```

### Right

```html
<link rel="prev" href="/page/1" />
<link rel="next" href="/page/3" />
<link rel="canonical" href="/" />
```

## How to fix

1. Give every page of the list a canonical address that is itself, the first included.
2. In an SEO plugin or the store's theme, turn off "canonical to the first page" or "canonical to the archive for paginated pages".
3. Link the pages with plain `<a href>` links that Google can follow, not only a "load more" button without an address.
4. If an infinite scroll loads more products, give the page an address for each chunk as well, so that the products are reachable by link.
5. Redirect `?page=1` to the address without the parameter.

For example:

```html
<link rel="canonical" href="https://shop.example/oud?page=2" />
```

## FAQ

### Does Google still use rel prev and next?

No. Google stopped using them to understand a series, and reads each page on its own. Keep them if you like: other search engines and browsers may use them, and the checker uses `prev` only to tell that a page is a later one.

### Should paginated pages be `noindex`?

No. A page of the list that is `noindex` can end up with its links not followed, and the products on it become hard to reach. Leave them indexable with a canonical of their own.

### What about a "view all" page?

If a single page lists every product and loads fast, it can be the canonical for the pages of the list. If it is slow or huge, it hurts more than it helps. Test before you choose.

### Does it check the whole list?

No, only the page you give. Test page 2 or a later one: the first page has no problem to find.

## Methodology

We read the page's address and its `<link>` elements as the server sends them. A page is a later page of a list when its address has a page number of 2 or more or when it has a `rel="prev"` link; its canonical address is compared with its own, ignoring the fragment, tracking parameters and a trailing slash. See the rule's page for the details.
