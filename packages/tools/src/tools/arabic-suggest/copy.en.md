---
summary: Type a word and see what Google suggests after it in Arabic: by letter and by question, with a CSV.
---

# Arabic search suggestions

Type one word or a short phrase and we ask Google's public suggestions about it in Arabic: the word itself, after the question words (كيف, لماذا, ما, أفضل) and after each letter from ا to ي. They are grouped without repeats and you can download them as CSV.

## What it checks

- 33 questions to Google for each word: the word, 4 question words before it and 28 letters after it.
- Each suggestion once, in the first group it appeared in: the word, then the questions, then the letters.
- Readable groups, "The word", "Questions" and "By letter", and a search inside the list.
- A CSV built in your browser (group, trigger, suggestion) with an encoding that Excel reads in Arabic.
- It runs only when the service's operator turns it on, because Google's terms do not offer this page for automated use.

## Example

### Wrong

```html
<h1>القهوة</h1>
<p>القهوة مشروب شائع في المنطقة.</p>
```

### Right

```html
<h1>كيف أحضّر القهوة العربية؟</h1>
<h2>أفضل أنواع القهوة العربية</h2>
<h2>لماذا تُقدَّم القهوة العربية مع التمر؟</h2>
```

## How to fix

Suggestions are what people actually type after your word. Use them to build the page on their questions, not on your guess:

- Make the suggestion closest to your word the page's `<h1>`, and turn the "how" and "why" questions into `<h2>` headings, each answered under it by a short paragraph.
- Gather close suggestions in one page, and give a page of its own to each different search intent (buying, comparing, explaining).
- Write the word in the spelling Google suggests: it is the one most people use.
- Try the tool with words from your customers, not from your site's language: you will find forms and dialects you had not thought of.

```html
<h1>كيف أحضّر القهوة العربية؟</h1>
<p>أسخّن الماء ثم أضيف القهوة والهيل، وأتركها على نار هادئة خمس دقائق.</p>
<h2>أفضل أنواع القهوة العربية</h2>
<h2>لماذا تُقدَّم القهوة العربية مع التمر؟</h2>
```

## FAQ

### What is sent to Google?

The word you type and what we add to it (a question word or a letter), from our server as ArablyzerBot through the egress proxy, not from your browser. We send nothing else, not your address, and we do not store your word.

### Why does the tool sometimes say it stopped or did not understand Google's answer?

Because this page at Google is not a documented interface and can change or block requests without notice. If the answer is not what we read we stop and give you what we gathered until then.

### Why does it not give everything?

Each question returns about ten suggestions, the ones any searcher sees at that moment, and they change by country and time. It is a strong sample of ideas, not a count of search volume.

### How often can I use it?

Each word takes one scan from your quota like any scan, and we keep the answer for a day so Google is not asked twice about the same word.

## Methodology

We build 33 questions: the word, "كيف", "لماذا", "ما" and "أفضل" before it, and each of the 28 letters from ا to ي after it. We ask Google's public suggestion endpoint (`suggestqueries.google.com`) one question at a time with half a second between them, 40 seconds at most in all, as ArablyzerBot, and keep each answer a day in memory. We stop at the first answer we do not read (not JSON) and say so. Repeats are removed by comparing the text after folding spaces and case, so a suggestion stays in the first group it appeared in.
