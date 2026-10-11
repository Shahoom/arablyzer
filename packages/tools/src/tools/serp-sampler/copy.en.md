---
summary: Who ranks in Google's top ten for your queries, which are Arabic sites, and where are you?
---

# Who competes with you on Google

Type up to five queries (and your domain, optionally). We read Google's results and show the domains of the first ten organic results for each query, mark the Arabic sites, say at what position your domain appeared, and name the domains that recur across your queries.

## What it checks

- The domains of the organic (non-ad) results in the first ten for each of the five queries.
- Which are Arabic sites by our own tool: the result's title is mostly Arabic letters, or its domain ends in an Arab country's suffix.
- Your domain's position in each query, if you typed it.
- **Recurring rivals**: domains that appear in two or more of your queries.
- We neither keep nor show a result's address, text or snippet, only its domain. It runs only when the service's operator turns it on.

## Example

### Wrong

```html
<title>الصفحة الرئيسية</title>
```

### Right

```html
<title>قهوة مختصة في الرياض | الواحة</title>
```

## How to fix

Look at who is ahead of you for each query and do what they do better:

- Open the pages of the top rivals for the query and see what they share: the type of page (list, guide, shop), its length, its headings, and whether they answer the question at the top.
- Put the query in your page's `<title>` and `<h1>` as the searcher writes it, not as you name your product.
- If the recurring rivals are Arabic sites, make your page in the same clear Arabic, declare its language with `lang` and mind its direction.
- If your domain is missing from the top ten, check Search Console to see if it is at 11 to 20 (the "Your keywords on Google" tool).

```html
<html lang="ar" dir="rtl">
<title>قهوة مختصة في الرياض | الواحة</title>
<h1>قهوة مختصة في الرياض</h1>
```

## FAQ

### Does it give me my real ranking?

No. Google's ranking varies by country, device, earlier searches and your account. What we show is a readable sample from a server, so treat it as a rough picture of rivals, not an official rank. For your real rank use Search Console ("Your keywords on Google").

### Why does the tool say Google asked for a check?

Because Google does not offer the results page for automated use and asks servers it does not know for a consent page or a test. When that happens we stop at the first request and say so, and we do not try to get around it. The tool may not work from a server address at all.

### How does it know a site is Arabic?

By two signals that we show: the result's title is more than half Arabic letters, or the domain's suffix is an Arab country's (sa, ae, eg …) or the domain is written in Arabic. A `.com` site with an English title is not known as Arabic even if its content is Arabic.

### What does the tool keep?

We keep for a day in memory the list of domains for each query we read, so we do not ask Google again, and we keep no addresses, no texts and no queries linked to you. Each request takes one scan from your quota.

## Methodology

We request the results page from `www.google.com/search` in Arabic, ten results, from our server through the egress proxy as ArablyzerBot, one query after another with two seconds between them, stopping at the first check. We read the organic links in the two known page shapes (the light one whose links go through `/url?q=` and the full one whose result has an `<h3>` title), skip Google's own domains and take each domain once. We keep the position, the domain, whether it is Arabic and why. The title is read only to decide whether the site is Arabic and is not kept. A recurring rival is a domain that appears in two or more queries.
