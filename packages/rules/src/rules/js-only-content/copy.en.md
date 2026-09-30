# The page's content is written by scripts

## Messages

### scripted

{missing} of the {total} Arabic words the browser drew in the parts of the page it measured ({share}%) are not in the text of the HTML the scan received, before scripts ran. Scripts may write them after loading, and whoever does not run JavaScript would not see them.

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
3. We gather the words of all the text in the body of the HTML the scan receives, before JavaScript runs: the text a visitor sees, and text that is hidden or in `<noscript>` or `<template>`, since it is in the HTML as sent. Text in `<script>` and `<style>` is code, and is not counted. We count the words of the rendered page that are not among them.
4. A browser is judged only when it drew at least 20 Arabic words. With fewer, a language switch or a cookie notice that a script adds would say nothing of how the page is written. The number is our own choice for this rule, not a standard's.
5. The rule fails when more than half of the Arabic words a browser drew are not in the HTML the scan received. Each browser is measured on its own, and the finding names those where this holds.
6. The rule applies to a page on which a browser drew at least 20 Arabic words. It does not judge other text, nor images.
7. The rule measures which words the HTML lacks, and not who wrote them. The scan asks for the HTML without saying which language it prefers, while the browsers ask for Arabic (`Accept-Language: ar`): a site that picks the language of its HTML on the server from that header may send the scan another language than it sends a browser, and the rule then finds the Arabic words missing. And text a script adds beside the page's own, such as a cookie notice, counts among the words the HTML lacks.

## References

- [Google Search Central: Understand the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
