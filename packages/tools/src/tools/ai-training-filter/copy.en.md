---
summary: Does your page's text pass the FineWeb-2 quality filters for Arabic that AI training data is cleaned with?
---

# Does your content pass the AI training filters?

Runs the quality filters published in the FineWeb-2 pipeline for Arabic on your Arabic page's text, and shows each filter's measure, its threshold and whether it passed.

## What it checks

- Gopher repetition: repeated lines, the most repeated runs of 2, 3 and 4 words, and repeated passages of 5 to 10 words.
- FineWeb quality: the share of lines that end in punctuation, repeated lines, and lines per word.
- Gopher quality: word count, average word length, symbols, ellipses and bullet points, the share of words with letters, and common Arabic words.
- With the Arabic thresholds published in `configs/arb_Arab.yml` of the FineWeb-2 repository. Language identification is an estimate from the share of Arabic letters, not the GlotLID model, and the C4 filters are a reference, not a verdict; both are marked so.

## Example

### Wrong

```html
<p>نحمّص القهوة الطازجة كل يوم ونشحنها إلى جميع المدن بأفضل الأسعار</p>
<p>نحمّص القهوة الطازجة كل يوم ونشحنها إلى جميع المدن بأفضل الأسعار</p>
<p>نحمّص القهوة الطازجة كل يوم ونشحنها إلى جميع المدن بأفضل الأسعار</p>
```

### Right

```html
<p>الماء عنصر لا يقل أهمية عن الحبوب نفسها، فالماء الثقيل بالأملاح يخفي النكهات الرقيقة. يُفضَّل أن تكون حرارته قريبة من الخامسة والتسعين مئوية، وأن يُسكب ببطء حتى تتشبع الحبوب بالتساوي.</p>
```

## How to fix

- Write paragraphs of whole sentences that end in punctuation, and have fewer short lists with no explanation.
- Do not repeat the same paragraph on a page or on every page of the site.
- Have at least 50 words of connected Arabic on the page.
- Keep numbers and symbols next to text that explains them.

```html
<article>
  <h1>كيف نحمّص القهوة؟</h1>
  <p>نبدأ بحبوب خضراء، ثم نحمّصها على حرارة محسوبة. بعدها نتركها لتبرد قبل التعبئة.</p>
</article>
```

## FAQ

### Does passing mean models were trained on my page?

No. It means your page's text passes the published quality filters, which is a condition for it to enter data like this, not a promise that it does. The check says nothing about whether any company crawls your site.

### Why an estimate of the language and not the language model itself?

The GlotLID model FineWeb-2 uses is a fastText model that does not run on our server. So we show the share of the text's letters that are Arabic, held to the same threshold (0.711), as information, and build no verdict on it.

### Does this change my score?

It adds a minor finding if your text fails a published filter. It costs nothing if your text is under 50 words; then we say there is too little text.

## Methodology

We take the page's visible text without the navigation, header and footer, a line for each block, split it into words in a way that approximates spaCy's Arabic tokenizer, and apply Gopher repetition, FineWeb quality and Gopher quality in the pipeline's order. The thresholds are `configs/arb_Arab.yml` in [huggingface/fineweb-2](https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/configs/arb_Arab.yml) (commit d0defb24f193), and where that file is silent the defaults of [datatrove](https://github.com/huggingface/datatrove/tree/1977fbb0f3c163d43cace334b073dda17fa3ef26/src/datatrove/pipeline/filters) (commit 1977fbb0f3c1). This checks what Hugging Face has published, not what any company does.
