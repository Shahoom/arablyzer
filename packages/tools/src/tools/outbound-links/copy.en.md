---
summary: Which sites does your page link to, and which links are marked as paid?
---

# Outbound links checker

Give the address of a page and this tool lists the sites it links to, with how many links go to each and how they are marked: followed, `nofollow`, `sponsored` or `ugc`. It is information: it deducts nothing, and it shows where the page sends its readers.

## What it checks

- The sites the page links to, one entry for each, with the number of links, biggest first (30 at most).
- How many of each site’s links are plain, `nofollow`, `sponsored` and `ugc`.
- A subdomain of the page’s own site is the page’s own site; `mailto:`, `tel:` and in-page links are not links to a site.
- Only the links in the page’s HTML: a link that a script writes after the page loads is not seen.

## Example

### Wrong

```html
<ul>
  <li><a href="/about">من نحن</a></li>
  <li><a href="/contact">اتصل بنا</a></li>
</ul>
```

### Right

```html
<ul>
  <li><a href="https://www.example.org/guide">دليل التحميص</a></li>
  <li><a href="https://shop.example.net/offer" rel="sponsored nofollow">عرض الشريك</a></li>
</ul>
```

## How to fix

There is nothing to fix. Read the list, and mark each link by what it is:

```html
<a href="https://www.example.org/guide">دليل التحميص</a>
<a href="https://shop.example.net/offer" rel="sponsored nofollow">عرض الشريك</a>
```

- Mark a link you were paid or given something for with `rel="sponsored"`.
- Mark links your visitors add (comments, reviews) with `rel="ugc"`.
- Remove or replace links to sites you no longer stand behind, and check the rest still work with the broken links checker.
- Keep the other links plain: linking to good sources helps readers.

## FAQ

### Are outbound links bad for my ranking?

No. Linking to good sources is normal and helps readers. What Google warns against is selling links that pass ranking, and linking to spam.

### What is the difference between nofollow, sponsored and ugc?

All three tell Google not to give the link credit. `sponsored` says it was paid for, `ugc` says a visitor added it, and `nofollow` is the general one. Google treats all three as hints.

### Does it check that the links work?

No: it lists them. The broken links checker requests a page’s links and says which fail.

## Methodology

The check reads the links in the page’s HTML whose address is http or https, groups them by site (a name and the part of it that is registered, so `blog.example.org` and `example.org` are one), and counts the `rel` tokens of each. It is information alone, so nothing is deducted. The first 30 sites are listed, by number of links.
