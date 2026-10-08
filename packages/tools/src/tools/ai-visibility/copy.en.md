---
summary: Do ChatGPT, Gemini, Perplexity and Claude mention your site when asked Arabic questions?
---

# AI visibility in Arabic

Puts Arabic questions about your page's field to AI assistants and records whether they mentioned your brand or cited your domain, and whom they named instead of you.

## What it checks

- 3 to 5 questions in Arabic, made from your page's title, main heading, brand name and country.
- For each assistant the server has a key for: OpenAI, Gemini, Perplexity and Claude, with its web search turned on.
- Whether your brand or domain was mentioned, whether your domain was cited as a source, and which other domains were cited.
- We keep no answer text, only what we derived from it.
- It runs only if the server's operator has put in at least one key, and the operator then bears the cost of the requests.

## Example

### Wrong

```html
<p>لا يعرف المساعدون موقعنا.</p>
```

### Right

```html
<p>يذكر المساعدون موقعنا ويستشهدون به.</p>
```

## How to fix

- Write pages that answer the same questions in Arabic, in whole sentences and with headings that carry the question.
- Let AI crawlers in with robots.txt.
- Fix your brand name in Arabic and Latin forms in the structured data.
- Earn mentions in the sources assistants cite.
- Check again in a few weeks.

```txt
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /
```

## FAQ

### What goes from my site to the assistants?

Text questions in Arabic that carry your brand name, your page's subject and its country if we know it. Not your whole page, and none of your visitors' data.

### What does the tool cost?

Nothing to you; the server's operator pays the providers for the requests. The tool is capped: 5 questions at most for each assistant, an answer of 600 tokens at most, 20 requests in the whole run, and the short result is kept for a day so it is not repeated.

### Why does the result differ from one time to the next?

Because assistants do not answer the same way every time, and their web search changes. This is a snapshot, not a verdict.

## Methodology

We make the questions by fixed templates, ask each assistant using its web search (Responses at OpenAI, Grounding with Google Search at Gemini, the Agent API at Perplexity, and the web search tool at Claude), read the answer for your brand name or domain in the text and the sources, and throw the answer away. The model ids were read from the providers' documentation on 4 October 2026, and the operator changes them with environment variables.
