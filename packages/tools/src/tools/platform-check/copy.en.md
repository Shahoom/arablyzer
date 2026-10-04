---
summary: Which platform does a site run on: WordPress, Salla, Zid, Shopify? And which builder, plugins and services?
---

# Platform check

Reads a page and tells you what it runs on: the CMS or store (WordPress, Salla, Zid, YouCan, Shopify and more), its page builder, its major plugins and the analytics, CDN and frameworks it loads, with each one's version where the page says, how sure the match is and what was seen.

## What it checks

- The response's headers and cookies: `x-powered-by`, a platform's own headers, and cookie names such as Zid's.
- The page's meta tags, such as `generator`, and the addresses of its scripts, stylesheets and images, such as `/wp-content/plugins/…` or Salla's CDN.
- The result is information, never deducted: each technology once, with its confidence out of 100 (75 and over is sure) and the first thing that showed it.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>متجر الواحة</title>
  </head>
  <body>
    <h1>قهوة عربية</h1>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>متجر الواحة</title>
    <meta name="generator" content="WordPress 6.4.2" />
    <script src="/wp-content/themes/oasis/app.js"></script>
  </head>
  <body>
    <h1>قهوة عربية</h1>
  </body>
</html>
```

## How to fix

There is nothing to fix: the check lists what it finds and judges nothing. Use the platform it names to choose the fix for your other findings, in its own settings or plugins, and keep its core and plugins up to date.

To see what the check sees in a page's headers, ask for them yourself:

```sh
curl -sI https://example.com/ | grep -iE "x-powered-by|set-cookie|server"
```

- WordPress: a missing description is set in an SEO plugin such as Yoast SEO or Rank Math, in the page's own fields.
- Salla: SEO settings are in the store's dashboard, and each product and page has its own title and description fields.

## FAQ

### Why does the check not find my platform?

For one of these reasons: the platform shows itself only after scripts run, which we do not run in this check; its markers are hidden, for example a theme that removes the `generator` tag; it sits behind a proxy that rewrites the headers; or the fingerprint list does not know it. Nothing is guessed, so a miss is a miss.

### How sure is the result?

Each marker weighs a number, and the confidence is their sum, at most 100. A header or a cookie only one platform sets weighs a lot; an address that other sites share weighs little. Read 75 and over as sure, 50 to 74 as likely, and less as a hint.

### Does it work for Arab platforms?

Salla, Zid and YouCan have markers we checked against public stores. ExpandCart's markers come from its documentation and were not checked, so its confidence is low. Where a platform has no marker we trust, it is left out rather than guessed.

### Why is the result not deducted from the score?

Because it is information: which platform a site runs on is not a fault.

## Methodology

The fingerprints are a pinned subset of the open-source [webappanalyzer](https://github.com/enthec/webappanalyzer) list (GPL-3.0), plus Arablyzer's own for Arab platforms. We read the fetched page alone: its headers, cookies, meta tags and the addresses in its tags. Nothing is run, clicked or submitted. See the rule's page for the details.
