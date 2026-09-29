---
summary: Is your page's text in the HTML the server sends, or do scripts write it after loading?
---

# JavaScript rendering check

Renders your page in browsers and compares its Arabic text, as visitors see it, with the text of the HTML the server sends, to show how much of it scripts write after loading, which only those who run JavaScript see.

## What it checks

- The Arabic text on the page as Chromium and Firefox draw it, and WebKit where it runs: the first 200 visible elements with Arabic text, in the page's order.
- The Arabic words of that text that are not in the HTML the server sends, before JavaScript runs, whatever their marks or tatweel.
- The page fails when more than half of those words are written by scripts, in one browser at least.

## Example

### Wrong

```html
<main id="app">
  <h1>قهوة عربية بالهيل</h1>
</main>
<script src="/app.js"></script>
```

### Right

```html
<h1>قهوة عربية بالهيل</h1>
<p>قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، في علب تُشحن خلال يومين.</p>
```

## How to fix

Send the page's text in the HTML from the server, and let scripts add only what interaction needs, so the text arrives before them:

```html
<main id="app">
  <h1>قهوة عربية بالهيل</h1>
  <p>قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، في علب تُشحن خلال يومين.</p>
</main>
<script src="/app.js" defer></script>
```

- **Server-side rendering** (SSR): the server builds the page's whole HTML for each request, and JavaScript takes it over in the browser. Common frameworks support it, such as Next.js, Nuxt, SvelteKit and Astro.
- **Pre-rendering** (static generation): each page's HTML is built once, when the site is published, which suits pages whose content is the same for every visitor.
- Then open "View page source" in the browser and make sure the text is there, or check the page again.

## FAQ

### Doesn't Google run JavaScript?

It does. Google processes JavaScript pages in three phases: crawling, rendering, then indexing. But a page waits for rendering in a queue where it may stay a few seconds or longer, and Google says server-side rendering or pre-rendering is still a great idea, since it makes the site faster, and not all bots can run JavaScript.

### My site is built with React or Vue: will it fail?

Not necessarily. When the server builds the page's HTML and JavaScript then takes it over in the browser, the text is in the HTML and the page passes, even if scripts draw it again. It fails when the HTML arrives nearly empty and JavaScript writes all the text.

### Why does the tool count Arabic words alone?

Because it reads the Arabic text the browsers measure on the page, which is what Arablyzer is built for. Text in other languages is not counted, nor are images.

### Why does this check take longer than others?

Because it renders the page in browsers and runs its scripts before it measures its text, instead of reading the HTML alone.

## Methodology

We fetch the page as `ArablyzerBot` and read its visible text in the HTML as the server sends it, before JavaScript runs. We then render it in Chromium and Firefox, and WebKit on servers with an isolated network, with every request it makes going through a proxy that refuses private addresses. In each browser we read the first 200 visible elements with Arabic text and the first 200 characters of each element's text, and count their Arabic words, each run of Arabic letters, read as one word whatever its marks or tatweel. The page fails when more than half of those words in a browser are not in the HTML's text, and we name the browsers where this holds. The same page gives the same result every time.
