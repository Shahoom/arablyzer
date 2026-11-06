---
summary: Are your page's FAQ answers real text in the HTML, the same as its markup?
---

# FAQ answers checker

Give the address of a page and this tool checks that the questions and answers in its `FAQPage` markup are on the page as text in the HTML: that a crawler, a search result or an AI assistant that reads the page finds the answers there and not only in the markup or in what a script draws later.

## What it checks

- Each question of the page's `FAQPage` is in the page's visible text.
- Each answer's start (the first 50 letters, spaces and markup left out) is in the visible text too.
- Text in code and in scripts does not count as the page’s: only text a visitor reads.
- A page with no `FAQPage` markup has nothing to check here; this tool does not ask that a page have one.

## Example

### Wrong

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "كم يستغرق الشحن؟",
      "acceptedAnswer": { "@type": "Answer", "text": "يصل الطلب خلال يومين." }
    }
  ]
}
</script>
<details>
  <summary>كم يستغرق الشحن؟</summary>
  <p>نشحن في أقرب وقت ممكن.</p>
</details>
```

### Right

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "كم يستغرق الشحن؟",
      "acceptedAnswer": { "@type": "Answer", "text": "يصل الطلب خلال يومين." }
    }
  ]
}
</script>
<details>
  <summary>كم يستغرق الشحن؟</summary>
  <p>يصل الطلب خلال يومين.</p>
</details>
```

## How to fix

Make the answers text in the page, the same as the markup:

```html
<details>
  <summary>كم يستغرق الشحن؟</summary>
  <p>يصل الطلب خلال يومين.</p>
</details>
```

- Write each question and its answer in the HTML (a closed `<details>` is fine).
- Write the markup from the same list that draws the page; the FAQ markup generator does.
- If a script draws the answers after the page loads, put them in the HTML instead, or render the page on the server.
- Remove from the markup what the page does not show.

## FAQ

### Why do answers need to be text in the HTML?

A crawler or an AI assistant that does not run scripts reads only the HTML. An answer drawn later is not there to find, and Google asks that markup describe what is visible.

### Does my page need FAQ markup?

No. A page without it is not judged here. If you add it, it must match the page.

### My answers are in an accordion. Are they visible?

Yes if the text is in the HTML, open or closed. If the accordion loads the text when it is opened, it is not in the HTML.

## Methodology

The check reads the `FAQPage` blocks of the page's JSON-LD and compares each question, and the start of each answer, with the page's visible text after folding case and spacing and taking markup out of the answers. It reads the HTML as the server sent it, so text a script adds is not seen. The 50-letter start is Arablyzer's choice, to leave a long answer with a link at its end alone.
