---
summary: Do your robots.txt and your bot protection let AI crawlers reach your page?
---

# AI access checker

Checks whether AI search crawlers can reach your page: what your robots.txt tells them, and whether your site answers bots with a challenge instead of the page.

## What it checks

- Whether robots.txt blocks the page for AI search crawlers, `OAI-SearchBot` from OpenAI, `Claude-SearchBot` from Anthropic and `PerplexityBot` from Perplexity, or answers with a server error (5xx) or cannot be reached, which crawlers that follow RFC 9309 treat as blocking the whole site.
- Whether the site answered our request with a bot challenge instead of the page, by the header its service documents: Cloudflare's `cf-mitigated: challenge`, or AWS WAF's `x-amzn-waf-action`. This one is information: AI crawlers may be refused the same way.

## Example

### Wrong

```http
HTTP/1.1 403 Forbidden
Content-Type: text/html; charset=UTF-8
cf-mitigated: challenge
```

### Right

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

## How to fix

- Allow AI search crawlers in robots.txt, and block the training crawlers if you want to:

```text
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

- If your site answers bots with a challenge, decide which crawlers should reach your pages, and let them through the rules that challenge.
- In Cloudflare, a custom rule placed first, with the expression `(cf.client.bot)` and the Skip action, lets verified bots, such as search engine crawlers, bypass your other custom rules. Bot Fight Mode, on the Free plan, cannot be bypassed this way: turn it off, or upgrade to Super Bot Fight Mode (Pro and above).
- In AWS WAF, the challenge comes from a rule whose action is CAPTCHA or Challenge: narrow what that rule matches.

## FAQ

### How does it differ from the AI crawler checker?

The AI crawler checker reads robots.txt alone. This tool also reads your site's answer to our bot, which can refuse a crawler that robots.txt allows: a bot protection service may answer with a challenge instead of the page.

### If ArablyzerBot is challenged, are AI crawlers challenged too?

Not necessarily. A challenge comes from rules your protection service applies, and they may let some bots through, such as the verified bots a Skip rule lets past Cloudflare's custom rules. We see only the answer to our own request, as `ArablyzerBot`, so the result says AI crawlers may be refused the same way, not that they are.

### Why does the check not get past the challenge?

Arablyzer never tries to get past a CAPTCHA or any bot protection. When the answer is a challenge, the report says the site blocked the check, and the page's content is not checked.

### Which challenges does it detect?

Those whose service documents a mark in the response: Cloudflare's `cf-mitigated: challenge` header, set on every kind of its challenge pages, and AWS WAF's `x-amzn-waf-action` header, `challenge` or `captcha`. We guess nothing from the page's text, so other services' challenges, and a plain refusal such as `403`, are not reported as challenges.

## Methodology

We fetch the site's robots.txt, then the page, as `ArablyzerBot`. robots.txt is read following RFC 9309 with the leniency of Google's open-source parser, up to 500 KiB and following at most 5 redirects; for each AI search crawler on our list, the group that names it, or the `*` group when there is none, decides by its longest rule that matches the page's path. The page's answer is read whatever its status, and a challenge is told apart by the header its service documents alone. When the answer is a challenge, nothing reads it as the page, and no browser opens it, since running its script could get past it. A challenge is information, so the rule deducts nothing; but a page the site answered with one was not checked, so the scan has no score.
