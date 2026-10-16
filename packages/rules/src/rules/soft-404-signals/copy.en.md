# Page says it was not found but answers 200

## Messages

### soft-404

This page answers {status}, but its {source} says it does not exist (“{text}”): a soft 404.

## Why it matters

- A page that says "not found" and answers 200 tells a search engine the opposite of what it tells a visitor. Google calls it a soft 404: it may keep the address in its index or list it as an error in Search Console, and it spends crawling on addresses that lead nowhere.
- Stores produce them: a removed product that still opens a "this product is not available" page with a 200, a search that finds nothing, a mistyped category.
- The right answers are 404 (not found) or 410 (gone for good) for a page that does not exist, and a 301 to the closest page for one that moved.

## How to fix

1. Make the server answer 404 or 410 for a missing page, with the same page body: the visitor sees the same message and the crawler is told the truth.
2. For a product that is gone for good, answer 410 or redirect (301) to the closest category; for one that is out of stock for a while, keep the page and say so with the offer's availability markup.
3. For a search with no results, a 200 with "no results" and a `noindex` is right: it is a real answer, and the page is not for the index.
4. Test it: open an address that cannot exist, such as `/does-not-exist-12345`, and look at the status in the browser's network panel.

```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
```

## How we detect

1. We read the answer whatever its status. A 404 or 410 passes; any status other than 2xx, 404 and 410 is not judged.
2. On a 2xx page we read the title and the first heading for the words an error page uses: "page not found", "does not exist", «الصفحة غير موجودة»، «لم نعثر على الصفحة»، «خطأ 404»، or a lone 404.
3. We keep the finding only when the page has little text: 2,000 letters at most (our figure), so an article about error pages is not taken for one.

The page you give is the page judged. To test how a site handles a missing page, give an address that does not exist and see that the answer is a 404: this check reports a soft 404 only when the page answers 200.

## References

- [Google Search Central: Soft 404 errors](https://developers.google.com/search/docs/crawling-indexing/http-network-errors#soft-404-errors)
- [RFC 9110: 404 Not Found and 410 Gone](https://www.rfc-editor.org/rfc/rfc9110#name-404-not-found)
