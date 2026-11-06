# FAQ markup says what the page does not

## Messages

### question

{count} questions in the page's FAQPage markup are not on the page, such as «{question}».

### answer

{count} answers in the page's FAQPage markup are not on the page as the markup gives them, such as the answer to «{question}».

## Why it matters

- Google asks that structured data describe what the visitor can see on the page. FAQ markup for questions and answers the page does not show is against its structured data policies, and can cost the page its rich results or bring a manual action.
- An answer that only the markup holds, or that a script draws after the page loads, is not in the HTML that a crawler or an AI assistant reads, so it is not there to be found or quoted.
- When the visible answer and the markup differ, a visitor reads one thing and Google another: the page says two things.

## How to fix

Write the question and the answer in the page, and give the markup the same words:

```html
<details>
  <summary>كم يستغرق الشحن؟</summary>
  <p>يصل الطلب خلال يومين إلى كل مدن المملكة.</p>
</details>
```

- Show every question the markup has, with its answer, in the page's HTML (a closed `<details>` is fine: the text is in the page).
- Generate the markup from the same list that draws the page, so the two cannot drift.
- Remove from the markup a question you took off the page.
- Keep FAQ markup for real questions and answers written by the site; it is not for ads or for answers from visitors.

## How we detect

1. We read every `FAQPage` in the page's JSON-LD, and each `Question` of its `mainEntity`.
2. A question counts as on the page when its text, with spacing and case folded, is in the page's visible text (code samples included, scripts and styles not).
3. An answer counts when the start of it (the first 50 letters, with spaces and markup left out) is in the visible text. We compare the start so that a long answer, or one with links, is not wrongly flagged for a small difference at its end.
4. One finding for each message, with how many and the first question.

## References

- [Google Search Central: FAQ structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Google Search Central: structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
