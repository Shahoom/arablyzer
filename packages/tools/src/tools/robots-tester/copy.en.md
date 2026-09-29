---
summary: Paste a robots.txt file and type a URL, and see whether Googlebot or AI crawlers may fetch it.
---

# robots.txt tester

Paste a robots.txt file, type the URL you want to test and choose a crawler: the tester tells you whether the crawler may fetch the URL, and which rule on which line decided, as Google reads the file.

## What it checks

- The group that applies to the crawler: the one that names it, or the `*` group when no group does.
- The rule that decides for the URL: the longest pattern that matches it, with `Allow` winning a tie, as Google's parser does.
- Patterns with `*` and `$`: the star for any run of characters, and `$` for the end of the URL.
- The crawlers: Googlebot and Bingbot, AI search crawlers such as OAI-SearchBot, Claude-SearchBot and PerplexityBot, and training crawlers such as GPTBot and ClaudeBot.

## Example

### Wrong

```robots.txt
# Keep AI away from our content
User-agent: Googlebot
Allow: /

User-agent: *
Disallow: /
```

### Right

```robots.txt
# Keep our content out of AI training only
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /

User-agent: *
Disallow: /cart/
```

## How to fix

If the file blocks a crawler you want, find the rule and its line as the tester names them, and change it. To exempt a path from a wider block, for one, add an `Allow` with a longer pattern than the block's, since the longer one wins:

```robots.txt
User-agent: *
Disallow: /account/
Allow: /account/help/
```

- To keep your content out of model training but not out of search, name the training crawlers in a group of their own, such as GPTBot, ClaudeBot and Google-Extended, rather than blocking everyone with the `*` group.
- To let a crawler through where the `*` group blocks, write it a group by name: a crawler follows its own group alone and leaves `*`.
- Test the URL again after each change, then put the file at your site's root, such as `https://example.com/robots.txt`.

## FAQ

### Does the file I paste reach Arablyzer?

No. The tester runs in your browser, and nothing you paste leaves it.

### How is this different from the robots.txt checker?

The robots.txt checker fetches the file your site publishes and judges your page by it. This tester works on a file you paste, so you can try your changes before you publish them, on any URL and any crawler.

### Does robots.txt keep a page out of search results?

Not always. It blocks crawling, not indexing: Google may show the URL of a blocked page if it finds links to it, without a description. To keep a page out of the results, use `noindex` and leave crawling allowed.

### Why does Googlebot leave the * group when it has a group of its own?

Because under RFC 9309 a crawler follows the group that names it when there is one, and does not read the `*` group with it. So if you write it a group, put in it everything you want to keep from it.

## Methodology

The tester runs in your browser, with the code Arablyzer's robots.txt rules read files with, following Google's open-source parser and RFC 9309. We read the groups and their rules, pick the groups that name the crawler, whatever the letters' case, or the `*` groups when none does, and merge their rules. Then we match the URL's path and query against the rules' patterns, take the longest pattern that matches, and let `Allow` win a tie. The `/robots.txt` file itself is always allowed.
