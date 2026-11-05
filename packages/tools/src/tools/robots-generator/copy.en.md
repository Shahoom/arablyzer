---
summary: Write a robots.txt: block paths, choose what AI crawlers may do, name your sitemap.
---

# robots.txt generator

Choose the paths to keep crawlers out of, whether AI training crawlers (GPTBot, ClaudeBot, Google-Extended) and AI search crawlers (OAI-SearchBot, PerplexityBot…) may read your site, and where your sitemap is, and get a robots.txt file. The file is checked by the same code that checks sites’ files.

## What it checks

- That the file never blocks Googlebot: the file you get lets it in.
- AI training crawlers and AI search crawlers are separate choices, by the names (product tokens) their providers document: you can keep your text out of training and still be read when an assistant answers a question.
- Each path is written from the root and checked for what a robots.txt cannot hold; each sitemap is a full address.
- A note says what the file cannot do: robots.txt asks, it does not enforce.

## Example

### Wrong

```robots.txt
User-agent: *
Disallow: /
```

### Right

```robots.txt
User-agent: *
Disallow: /admin/

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /

Sitemap: https://www.example.com/sitemap.xml
```

## How to fix

Save the file as `robots.txt` at the root of your site (`https://example.com/robots.txt`), then test an address against it with the robots tester:

```robots.txt
User-agent: *
Disallow: /admin/
Disallow: /cart/

Sitemap: https://www.example.com/sitemap.xml
```

- Block paths of no value to a search (an admin, a cart, a search page), not the pages you want found.
- To keep a page out of Google, use `noindex` on the page, not robots.txt: a blocked page can still be listed from links.
- On a platform such as Salla, Zid or Shopify, the platform writes the file; check what it writes, and change it where the platform allows.
- Name the sitemap here so crawlers find it.

## FAQ

### Does blocking the AI training crawlers hurt my place in Google?

No. Googlebot is a different crawler from Google-Extended, which controls whether Google uses your pages to train its AI models. Blocking Google-Extended does not change search.

### Should I block the AI search crawlers?

It is your choice. Blocking them means AI assistants will not read your pages to answer from them, nor send their users to you. Many sites allow them for that reason.

### Does robots.txt keep a page secret?

No. It asks well-behaved crawlers to stay away, and anyone can read the file. Hide a page by putting it behind a password.

## Methodology

The generator runs in your browser. The AI crawlers are the list of Arablyzer’s AI crawler checks, each by the product token its provider documents and with the purpose they state (training or search), last checked on 2026-09-24. A test runs the robots checks over the files it writes.
