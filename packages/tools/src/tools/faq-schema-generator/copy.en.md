---
summary: Write the FAQ text and its FAQPage markup together, so they say the same.
---

# FAQ markup generator

Type your questions with their answers and get the FAQ as it appears in the page (a `<details>` for each) and the `FAQPage` markup written from the same words, so the markup describes what the visitor sees. Questions and answers are escaped in both.

## What it checks

- Each question with its answer, from blocks separated by an empty line; “Q:” and “A:”, or «س:» and «ج:», at the start of a line are taken off.
- The page text and the markup are written from one list, so they match word for word, which the `faq-schema-mismatch` check asks.
- `<`, `&` and quotes are escaped in the page, and a `</script>` in a question cannot end the markup block.
- A block of one line (a question with no answer) is left out.

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

Put the text where the FAQ should appear and the markup beside it, and generate both again whenever a question changes:

```html
<details>
  <summary>كم يستغرق الشحن؟</summary>
  <p>يصل الطلب خلال يومين.</p>
</details>
```

- Write real questions your customers ask, with answers that tell them something; not questions made for keywords.
- Keep the text visible: a closed `<details>` is fine, text drawn by a script is not in the HTML a crawler reads.
- Remove from the markup a question you remove from the page.
- On a platform, check whether an app already writes FAQ markup before adding more.

## FAQ

### Will FAQ markup give my page rich results?

Rarely. Google shows FAQ rich results mostly for well-known government and health sites now. The markup still states the questions and answers plainly for whoever reads the page, but it does not promise a rich result.

### Why must the text be on the page?

Google asks that structured data describe what the visitor can see. Markup for hidden or missing content is against its policies.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser. The page text and the `FAQPage` block are written from one list of questions, and a test runs the `faq-schema-mismatch` check over what it writes: it finds nothing. A `<` in the JSON is written as an escape.
