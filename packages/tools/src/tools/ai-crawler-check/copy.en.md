# AI crawler checker

Reads your site's robots.txt and shows which AI crawlers may reach the page and which it blocks, and warns you when AI search crawlers are blocked.

## What it checks

- Whether robots.txt blocks the page for AI search crawlers: `OAI-SearchBot` from OpenAI, `Claude-SearchBot` from Anthropic and `PerplexityBot` from Perplexity.
- Whether the training and user-request crawlers of these companies, and `Google-Extended`, are allowed or blocked, as information rather than a problem.
- Whether robots.txt answers with a server error (5xx) or cannot be reached, which crawlers that follow RFC 9309 treat as blocking the whole site; we treat 429 the same way, as Google does.

## Example

### Wrong

```robots.txt
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: PerplexityBot
Disallow: /
```

### Right

```robots.txt
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

## How to fix

Allow the search crawlers, and block the training crawlers if you want to:

```text
# Let AI search cite the site
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# Keep the content out of model training
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

A group that names a crawler takes precedence over the `*` group, so this works even when the file also has `User-agent: *` with `Disallow: /`.

## FAQ

### What is the difference between search and training crawlers?

Search crawlers such as `OAI-SearchBot`, `Claude-SearchBot` and `PerplexityBot` collect the pages that AI search answers can cite, with a link to the source. `GPTBot` and `ClaudeBot` collect content to train models, and `Google-Extended` is a robots.txt name that controls whether Google uses your content to train its models; it does not affect your presence in Google Search. Blocking training is a legitimate choice that we do not count as a problem.

### Does blocking AI search crawlers affect my visibility?

Your pages may be left out of those services' answers: OpenAI documents that sites blocking `OAI-SearchBot` are not shown in ChatGPT search answers, and Anthropic and Perplexity document a similar effect on visibility in their results.

### Does the tool detect a firewall blocking crawlers?

No. The tool reads robots.txt only, and a firewall or bot-protection service can block a crawler that robots.txt allows. We fetch the file as `ArablyzerBot`, so the result describes what we received.

## Methodology

We fetch robots.txt from the page's origin as `ArablyzerBot` and read it following RFC 9309 with the leniency of Google's open-source parser, up to 500 KiB and following at most 5 redirects. For each crawler on our list we take the group that names it, or the `*` group when there is none, and the longest rule that matches the page's path decides. Crawler names and purposes come from each company's documentation, and we update them when they change.
