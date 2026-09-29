# The page's content is written by scripts

## Messages

### scripted

Of the Arabic words the browser drew on this page, {missing} of {total} ({share}%) are not in the HTML the server sends: scripts write them after loading, so only those who run JavaScript see them.

## Why it matters

- Google processes pages built with JavaScript in three phases: crawling, rendering, then indexing. A page waits in a queue for rendering, and Google says it may stay there a few seconds, but it can take longer than that.
- In the app shell model, the initial HTML does not hold the actual content, so Google has to run JavaScript before it can see the page's content.
- So Google says that server-side rendering or pre-rendering is still a great idea: it makes the site faster for visitors and crawlers, and not all bots can run JavaScript.

## How to fix

Send the page's text in the HTML from the server, and let scripts add only what interaction needs:

- **Server-side rendering** (SSR): the server builds the page's whole HTML for each request, and JavaScript takes it over in the browser. Common frameworks support it, such as Next.js, Nuxt, SvelteKit and Astro.
- **Pre-rendering** (static generation): each page's HTML is built once, when the site is published, which suits pages whose content is the same for every visitor.
- Then make sure the text is in the HTML the server sends: open "View page source" in the browser, or check the page again.

## How we detect

1. We render the page in browsers and read the first 200 visible elements with Arabic text in it, in the page's order, and the first 200 characters of each element's text; when that cuts the text, its last word is left out.
2. We count their Arabic words, each run of Arabic letters, and read the same word as one whatever its marks, tatweel or presentation forms.
3. We gather the words of the visible text in the HTML the server sends, before JavaScript runs, and count the words of the rendered page that are not among them.
4. The rule fails when more than half of the Arabic words a browser drew are not in the HTML the server sends. Each browser is measured on its own, and the finding names those where this holds.
5. The rule applies to a page on which a browser drew Arabic text. It does not judge other text, nor images.

## References

- [Google Search Central: Understand the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
