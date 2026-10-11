---
summary: Does a page that says "not found" answer 404, or 200, which Google reports as a soft 404?
---

# Soft 404 checker

Reads a page's answer and its words and tells you whether it is a "not found" page that answers 200, which Google reports as a soft 404 in Search Console. To test how your site handles a missing page, give it an address that cannot exist, and see that the answer is a 404.

## What it checks

- The status the server answered: 404 and 410 are right for a missing page and pass.
- Whether a page that answered 200 says in its title or first heading that it does not exist, in Arabic or English: «الصفحة غير موجودة»، «لم نعثر على الصفحة»، "page not found", 404.
- That the page is short, as an error page is; a long article about error pages is not taken for one.

## Example

### Wrong

```html
<title>الصفحة غير موجودة | متجر الواحة</title>
<h1>الصفحة غير موجودة</h1>
<p>عذراً، لم نعثر على الصفحة التي تبحث عنها.</p>
```

### Right

```html
<title>عطر العود الملكي | متجر الواحة</title>
<h1>عطر العود الملكي</h1>
<p>عطر عود ملكي بتركيز عالٍ، في زجاجة من 50 مل.</p>
```

## How to fix

1. Make the server answer 404 for a page that does not exist, with the same page body: the visitor sees the message and the crawler is told the truth.
2. For a page that has gone for good, answer 410, or redirect (301) to the closest page when there is one.
3. For a product that is out of stock for a while, keep the page and say so in the product's availability markup; a 200 with "out of stock" is right and the checker does not report it.
4. For a search with no results, a 200 with "no results" and a `noindex` is right.
5. Test with an address that cannot exist, such as `/does-not-exist-12345`: the status must be 404. In Salla, Zid and Shopify this is the platform's, and you can only change the page's text.

```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
```

## FAQ

### How do I test my site's 404 page?

Give the tool an address that cannot exist on your site. If the answer is a 404, the tool says the page is not reached and has nothing to judge, which is right. If it answers 200 and says "not found", that is the problem.

### Why does Google care?

Because the address stays in its index, or is listed as an error in Search Console, and crawling is spent on pages that lead nowhere. A 404 or a 410 tells it to drop the address.

### What about a page that says "no results" after a search?

A search result page is a real answer. It answers 200 and should carry `noindex`; the checker only reads the title and the first heading for the words of an error page.

### Why does a long page not count?

An article about "404 errors" has the words in its title, and is not an error page. A page with more than 2,000 letters of text, our figure, is taken for content.

## Methodology

We read the answer whatever its status. A 404 or 410 passes. On a 2xx HTML page we read the title and the first heading for a short list of phrases an error page uses, in Arabic and English, and keep the finding only when the page has little text (2,000 letters at most, our figure). Nothing but the page is requested; the check does not request an address of its own invention. See the rule's page for the details.
