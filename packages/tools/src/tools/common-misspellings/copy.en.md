---
summary: Which misspellings of your page's main words (ta marbuta, hamza, Arabizi) do people type, and which does your page never write?
---

# Common search misspellings

Takes your page's main words, makes their common misspellings, asks Google's suggestions which ones people really type, and says which your page never writes.

## What it checks

- Up to 3 Arabic key words from the h1 and the title.
- Their misspellings: ta marbuta and ha, hamza forms, alef maqsura and ya, a letter dropped or swapped, and the word in Latin letters and digits (Arabizi).
- Which appear in Google's autocomplete suggestions, that is, which people type.
- Which are not among the page's words.
- It runs only when the server's operator turns it on, because it asks a suggestion endpoint that is not documented for automated use.

## Example

### Wrong

```html
<p>نحمص قهوة مختصة طازجة كل أسبوع.</p>
```

### Right

```html
<p>نحمص قهوة مختصة طازجة كل أسبوع، ويكتبها بعضهم قهوه أو qahwa.</p>
```

## How to fix

- Keep the correct spelling in headings and text.
- Add the common forms in one natural place: an image's alt text, an FAQ, or the synonyms of your own site search.
- Do not repeat the misspellings or stuff the page with them.

## FAQ

### Should I write misspellings on my page to show up in search?

No. Google unifies most of these forms. The gain is bigger in your own site search and in smaller engines, and in knowing what your visitors type.

### Why does the check not run on the server?

Because it asks a public suggestion endpoint at Google that is not documented for automated use and with which we have no agreement, so we turn it on only on the operator's explicit decision. When it is on we send 12 requests at most, one at a time, and keep the answer for a day.

### How do you know people type the misspelling?

We count a form as typed if one of Google's autocomplete suggestions for it begins with it. That shows that queries starting with it are common, not how many.

## Methodology

We choose the words from the h1 and then the title, skipping generic ones, make their misspellings and order them from likeliest, ask about as many as the 12-request cap allows, and compare with the page's words as written. Read what we send to Google on the tool's page before you run it.
