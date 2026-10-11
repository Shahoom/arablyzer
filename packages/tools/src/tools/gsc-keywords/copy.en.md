---
summary: Which words find you on Google, and which sit on page two, close to page one?
---

# Your keywords on Google

Connect Search Console once, with no account here, and see the Arabic queries that bring people to your site: clicks, impressions, CTR and position, the queries close to page one, the Arabic against Latin share, and queries spelled two ways.

## What it checks

- Your top 50 queries by clicks over the last 28 days, each with clicks, impressions, CTR and average position.
- **Near opportunities**: queries where your site sits between position 8 and 20 (page two and the edges of pages one and three) with at least 5 impressions, the most shown first.
- The share of queries written in Arabic, in Latin letters, and mixed, by count, clicks and impressions.
- Queries that are one word spelled two ways (أ and ا, ة and ه, ى and ي), which splits their impressions across two results.
- Nothing is stored: the permission is read-only, revoked as soon as the reading ends, and the result is shown once.

## Example

### Wrong

```html
<title>الواحة</title>
<h1>مرحبًا بكم</h1>
```

### Right

```html
<title>قهوة عربية مختصة | الواحة</title>
<h1>قهوة عربية مختصة تصلك طازجة</h1>
```

## How to fix

Start with the near opportunities: they are the cheapest thing you can win. A page at position 11 needs a small push, not a new page.

- Open the page that shows for the query (in Search Console, Performance, Pages) and make its `<title>` and `<h1>` say the query as people type it.
- Add a section that answers the query directly under its own heading, and link to it from other sections with the same wording.
- If a query appears in two spellings, put the one searched more in the title and mention the other naturally in the text, without repeating both.
- Do not stuff the query: Google understands synonyms, and what matters is that the page answers what the searcher asks.

```html
<title>قهوة عربية مختصة | الواحة</title>
<h1>قهوة عربية مختصة تصلك طازجة</h1>
<h2>أين أشتري قهوة عربية مختصة؟</h2>
<!-- في صفحة أخرى: نص الرابط هو الكلمة نفسها -->
<a href="/coffee/specialty">قهوة عربية مختصة</a>
```

## FAQ

### Do you store my Search Console data?

No. We ask for read permission only (`webmasters.readonly`) with a temporary token and no refresh token, read your site's data once, revoke the token at Google immediately, and show the result on your page once; it disappears after five minutes or on reload. There is no account and no database.

### Why does it not find my site?

Because the Google account you picked does not own or use your site in Search Console. Choose the account you added the site with and type the domain as it was registered (a domain property or a URL prefix). Your property may be an older `http` address or another subdomain.

### Why do I not see all my queries?

We read the top 1,000 queries by clicks over 28 days. Google also hides very rare queries (anonymized queries) to protect searchers' privacy, so the total is lower than the site's total. The page says when the list reached the cap.

### What exactly is a near opportunity?

A query where your site's average position is between 8 and 20 with enough impressions. The average counts every showing, so your site may be in position 3 for some searchers and 30 for others. It is a signal of what is worth working on, not a promise of a climb.

### Is it free, and without an account?

Yes, no sign-up here. You only need a Google account that owns your site in Search Console. It works when the service's operator has set the connection key; otherwise the page shows a notice.

## Methodology

We ask the Search Console API for a 28-day window ending two days ago (where the numbers settle) twice: the total, and the top 1,000 queries by clicks. From the queries we compute the rest by fixed rules: a query's script is read from its letters, not its digits; an opportunity has an average position from 8 to 20 and at least 5 impressions; spelling is folded (alef with hamza or madda to alef, alef maqsura to ya, ta marbuta to ha, marks and tatweel dropped) and two queries with one folded key are two spellings of one word. Ownership is read from your list of properties: we prefer a domain property, then the longest URL prefix that matches what you typed. The permission is temporary and revoked in every case, even when the reading fails.
