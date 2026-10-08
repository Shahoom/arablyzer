# AI assistants do not mention your site

## Messages

### absent

We asked {provider} {answered} questions in Arabic about your page's field, and none of its answers mentioned your brand or your domain. The sources it cited instead of you: {competitors}.

### uncited

{provider} mentioned your brand in {mentioned} of {answered} answers, but never cited your domain as a source in any: it knows your name and does not go back to your pages.

## Why it matters

- **Many people ask assistants instead of search engines**, and an assistant names a few sites in its answer; being absent from it is being absent from that request.
- **Being cited** (a link among the sources) is what brings a visit; the name alone does not get anyone to your site.
- **The competitors named** in the answer show what the assistant treats as a source for the subject.

## How to fix

- Write pages that answer the same questions in Arabic: whole sentences, headings that carry the question, and clear figures, dates and names.
- Let AI crawlers in with robots.txt (our AI crawler check) and add an llms.txt file if you like.
- Fix your brand name in its Arabic and Latin forms in the structured data (alternateName).
- Earn mentions in the sources assistants cite: Wikipedia, review sites, trade sites.
- Check again in a few weeks: assistants' answers change.

## How we detect

1. We make 3 to 5 questions in Arabic from your page's title, main heading, brand name and country (when the evidence names one), by fixed templates.
2. We ask each assistant the server has a key for, with its web search turned on: OpenAI (Responses API), Gemini (Grounding with Google Search), Perplexity, and Claude (web search tool), at most 600 tokens of answer each and no more requests than questions × assistants (20 at most).
3. We read each answer: the brand counts as mentioned if its name or domain is in the text or the sources, and as cited if its domain is among the cited links; we record the other domains cited. Then we throw the answer away: we keep no text an assistant wrote.
4. We keep the short result for a day in the server's memory so as not to repeat requests, never longer than a report is kept.
5. A server without keys has the tool stop with a notice and sends nothing. Assistants' answers vary from one time to the next; this is a snapshot, not a verdict. It is a minor finding.

## References

- [OpenAI: web search tool](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Google: grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- [Anthropic: web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Perplexity: Agent API](https://docs.perplexity.ai/api-reference/agent-post)
