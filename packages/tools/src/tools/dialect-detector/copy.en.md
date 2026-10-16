---
summary: Which Arabic is it: Modern Standard, Gulf, Egyptian, Levantine or Maghrebi? Paste a text or a page.
---

# Arabic dialect detector

Reads Arabic text you paste, or a page you give us the address of, and says which variety it is closest to, what share of its sentences each variety has, and whether that fits the country the page is written for. It uses CAMeL's dialect model on the sentences, beside a list of telling words that decides where it finds a clear dialect.

## What it checks

- The variety the text is closest to: Modern Standard, Gulf, Egyptian, Levantine or Maghrebi, with each one's share of the text's sentences.
- That the text does not mix two dialects, and that the headings do not speak in a different register from the text under them.
- That the dialect is the one of the country the page points to by two different kinds of evidence (domain, language, currency, calling code). A Gulf text on a page for an Egyptian shop, or the other way round, looks copied from another market.
- We name a dialect only when the model is sure (70% of the probability over the sentences and half of them won); where it is not, we say the model is not sure.

## Example

### Wrong

```html
<p>شلونك يا غالي؟ وايد عندنا عطور حلوة، وإذا تبغى عود ممتاز الحين تواصل معنا ونوصله لك بسرعة.</p>
```

### Right

```html
<p>ازاي تختار العطر المناسب؟ عندنا عطور حلوة اوي، ولو عايز عود ممتاز دلوقتي كلمنا ونوصله لك بسرعة.</p>
```

## How to fix

- Choose one voice for the brand: plain Modern Standard suits every market, and a local dialect suits one.
- If you choose a dialect, choose the one of the country you serve, and use the same words in the headings and the text.
- Read what you copied from another country's site or from a translator: it may carry its dialect with it.
- Name the page's market in its language tag, so that readers and checks know which country you address:

```html
<html lang="ar-SA" dir="rtl">
```

## FAQ

### Is dialect in shop copy a mistake?

No, it is a choice of tone. But a tone that changes between heading and text, or a dialect that is not the one of the country you address, looks unintended.

### How much text does the model need?

A page with 80 Arabic words or more, and it reads sentences, not words. On short text we say there is too little.

### What does it mean that Iraqi counts as Gulf?

The CAMeL model we use tells six apart: Beirut, Cairo, Doha, Rabat, Tunis and Modern Standard. We join Rabat and Tunis as Maghrebi, and what sounds Gulf counts as Gulf.

### Where does the text I paste go?

To our own Arabic language service, where it stays in memory for the few seconds the answer takes and is then deleted. We do not store or log it.

## Methodology

We split the text into sentences (at least eight words each and at most sixty) and CAMeL's model (Beirut, Cairo, Doha, Rabat, Tunis, Modern Standard) reads each one; we add their probabilities, weighted by words. For a page the word list decides where it finds a clear dialect (three telling words at least, a fifth of all the telling words), and otherwise the model decides if it is sure. The measured accuracy and the limits of the check are in the [deep Arabic plan](https://github.com/Shahoom/arablyzer/blob/main/docs/design/plans/m7-deep-arabic.md).
