# robots.txt blocks AI search crawlers

## Messages

### disallowed

robots.txt blocks {token}, {provider}'s search crawler, from this page with "{rule}" on line {line}.

### server-error

robots.txt answered HTTP {status}. Crawlers that follow RFC 9309, AI search crawlers among them, treat a server error (5xx) as blocking the whole site, and Google treats 429 the same way.

### unreachable

robots.txt could not be reached, and crawlers that follow RFC 9309, AI search crawlers among them, treat that as blocking the whole site.

## Why it matters

- AI search services, such as ChatGPT search, Claude and Perplexity, answer questions with links to their sources. Their search crawlers (OAI-SearchBot, Claude-SearchBot and PerplexityBot) collect the pages those answers can cite.
- When robots.txt blocks them, your page may be left out of those answers: OpenAI documents that sites blocking OAI-SearchBot are not shown in ChatGPT search answers, and Anthropic and Perplexity document a similar effect on visibility in their results.
- Search crawlers are not model-training crawlers such as GPTBot, ClaudeBot and Google-Extended. Blocking training is a legitimate choice that we do not count as a problem, but search crawlers can be blocked along with it by mistake, through a catch-all rule or a copied block list.

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

## How we detect

1. We use the same robots.txt parser and matching as the Googlebot rule, for each search crawler on our list: OAI-SearchBot from OpenAI, Claude-SearchBot from Anthropic and PerplexityBot from Perplexity. The names and purposes were checked against each provider's documentation, and we update the list when they change.
2. Training crawlers, and crawlers that fetch a page because a user asked, appear in the report's crawler table as allowed or blocked, and never make the rule fail.
3. When robots.txt answers with a server error (5xx) or cannot be reached, RFC 9309 asks crawlers to treat the whole site as blocked. We treat 429 the same way, as Google does, and report either in a single finding.

## References

- [OpenAI: Overview of OpenAI crawlers](https://developers.openai.com/api/docs/bots)
- [Anthropic: Does Anthropic crawl data from the web, and how can site owners block the crawler?](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity: How does Perplexity follow robots.txt?](https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
