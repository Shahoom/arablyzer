# AI crawlers

AI crawlers are programs that collect web pages for companies such as OpenAI, Anthropic and Perplexity: some for model training, some for search, some for user requests.

## Definition

Each AI crawler has its own robots.txt name, so you can allow some and block others:

| Crawler | Company | Purpose |
| --- | --- | --- |
| `GPTBot` | OpenAI | Content that may train its models |
| `OAI-SearchBot` | OpenAI | ChatGPT search results |
| `ChatGPT-User` | OpenAI | Visits a page when a user asks |
| `ClaudeBot` | Anthropic | Content that may train its models |
| `Claude-SearchBot` | Anthropic | Search results for its users |
| `Claude-User` | Anthropic | Visits a page when a user asks |
| `PerplexityBot` | Perplexity | Perplexity search results, not training |
| `Perplexity-User` | Perplexity | Visits a page when a user asks |

`Google-Extended` is not a crawler but a robots.txt name that decides whether Google may use your content to train Gemini models and for grounding; it has no effect on Google Search.

## Why it matters

- Blocking training is not blocking search: OpenAI documents that sites that block `OAI-SearchBot` are not shown in ChatGPT search answers, other than as navigational links, and that each setting is independent, so you can allow `OAI-SearchBot` while blocking `GPTBot`.
- User-triggered fetchers differ: OpenAI says robots.txt may not apply to `ChatGPT-User`, and Perplexity says `Perplexity-User` generally ignores it, while Anthropic says blocking `Claude-User` stops it fetching your content for users.
- AI features in Google Search, such as AI Overviews, follow the rules for `Googlebot`, not `Google-Extended`; to limit what they show from your pages, use `nosnippet` or `noindex`.

## Example

A robots.txt file that allows the search crawlers and blocks the training crawlers:

```text
# Search crawlers: allowed
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# Training crawlers: blocked
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

A group that names a crawler takes precedence over the `*` group. OpenAI says its search systems can take about 24 hours to reflect a change.

## Common mistakes

- A copied block list that blocks search crawlers along with training crawlers, so the site drops out of AI search answers.
- Rules only in the main domain's file while the Arabic site lives on `ar.example.com`: Anthropic asks for them in the file of every subdomain.
- A firewall that blocks crawlers robots.txt allows: Perplexity recommends allowing its crawlers there by matching both their name and their published IP addresses.

## References

- [OpenAI: Overview of OpenAI crawlers](https://developers.openai.com/api/docs/bots)
- [Anthropic: Does Anthropic crawl data from the web, and how can site owners block the crawler?](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity: Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
- [Google: List of Google's common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
