# “Page indexed without content” in Search Console: what it means and how to fix it

What the Page indexing report means by “Page indexed without content”: a page in Google’s index whose content Google could not read, and how to find the cause and fix it.

## What it means

- The page is in Google’s index, but for some reason Google could not read its content.
- Google names two possible reasons: the page may be cloaked to Google, showing it different content from what visitors see, or it may be in a format Google cannot index.
- This is not a robots.txt block, so do not look for the cause there.
- The message sits in the “Warning” group: it does not prevent indexing, but it reduces Google’s ability to understand the page.

## Why it shows

- **Content Googlebot does not see:** Google explains that it processes JavaScript pages in three phases, crawling, rendering and indexing, and that it can only index content that is visible in the rendered HTML. In the app shell model the first HTML does not hold the actual content, so if rendering fails or produces no text, the page stays empty for Google.
- **Different content for the crawler and the visitor:** for example the server sends the crawler a version other than the one the browser shows. Google treats cloaking as a violation of its policies, and asks you to make content that search engines have difficulty reaching, such as what JavaScript writes, available to them and to visitors alike, without cloaking.
- **An unsupported format:** a file whose content Google cannot index.

## How to fix

Start by learning what Google actually saw:

- Open the page in the URL Inspection tool, test the live URL, then view the tested page to see its screenshot and HTML as Google rendered it. If the content is missing there, that is what Google cannot see.
- Compare the HTML the server sends with what visitors see. Send the main text in the server’s HTML and let JavaScript add only the interactivity:

```html
<!-- Depends on JavaScript: nothing in the HTML but the container -->
<main id="app"></main>
<script src="/app.js"></script>

<!-- Better: the text is in the HTML, and the script takes over afterwards -->
<main id="app">
  <h1>Arabic coffee with cardamom</h1>
  <p>Freshly roasted and shipped within two days.</p>
</main>
<script src="/app.js"></script>
```

- Common frameworks such as Next.js, Nuxt, SvelteKit and Astro support server-side rendering or pre-rendering.
- Make sure the server sends the crawler and the visitor the same content, and that the page is not a file in a format Google does not index.

## How to check the fix

- Scan the page with the [JavaScript rendering checker](/tools/js-rendering-check): it compares the page’s Arabic text after rendering with the HTML the server sends, and shows how much of it scripts write (the [js-only-content](/rules/js-only-content) rule).
- Then use the [indexability checker](/tools/indexability-check) to make sure nothing else blocks the page.
- In the URL Inspection tool, run the live test again and confirm the screenshot shows the content, then choose “Validate fix” in the Page indexing report.

## FAQ

### Does a page indexed without content show in results?

The URL is indexed, but Google has not read the content, so it has nothing to match searches against. Fixing the rendering is what puts the page’s content in the index.

### Does this message mean I cloaked the page?

Not necessarily. Google lists cloaking as one possible reason among others, and the cause may be a page that relies on JavaScript that does not finish rendering for the crawler. Check Google’s screenshot of the page before concluding anything.

### Should I delete the page?

If the page has no value you could remove it and answer `404` or `410`. If it matters, fix whatever keeps Google from seeing its content.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google Search Central: Spam policies, cloaking](https://developers.google.com/search/docs/essentials/spam-policies)
