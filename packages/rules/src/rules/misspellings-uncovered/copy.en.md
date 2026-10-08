# Misspellings people type that your page never writes

## Messages

### typed-ta-marbuta

People type «{variant}», with ha in place of the ta marbuta, for «{term}» (Google suggests: «{suggestion}»), and your page's text never writes it.

### typed-hamza

People type «{variant}» for «{term}», with the hamza changed (Google suggests: «{suggestion}»), and your page's text never writes it.

### typed-ya

People type «{variant}» for «{term}», with ya and alef maqsura swapped (Google suggests: «{suggestion}»), and your page's text never writes it.

### typed-arabizi

People type «{variant}», in Latin letters and digits, for «{term}» (Google suggests: «{suggestion}»), and your page's text never writes it.

### typed-drop

People type «{variant}», with a letter left out, for «{term}» (Google suggests: «{suggestion}»), and your page's text never writes it.

### typed-swap

People type «{variant}», with two letters swapped, for «{term}» (Google suggests: «{suggestion}»), and your page's text never writes it.

## Why it matters

- **Some search engines do not unify spelling yet**: someone who types «قهوه» may not reach a page written «قهوة» in a site's own search or in a small engine, though Google mostly unifies them.
- **What people really type** shows in search suggestions; a form that shows there and is absent from your page is a small chance to cover more.
- **Arabizi** (qahwa, q7wa) is common in searches for brands and on social media.

## How to fix

- Keep the correct spelling in headings and text, and add the common forms only where they sit naturally: an image's alt text, a question in the FAQ, a store tag, or the synonyms of your own site search.
- Do not stuff the page with misspellings or repeat them: the aim is to cover a form once, in a sensible place.
- In your own site search unify spelling (ة/ه, ى/ي, hamza forms), as the «site search» check does.

## How we detect

1. We take up to 3 Arabic key words from the h1, then the title, skipping generic ones (store, site, company).
2. For each we make its common misspellings: ta marbuta/ha, hamza forms, alef maqsura/ya, a letter dropped, two letters swapped, and the word in Arabizi, likeliest first.
3. We ask Google's public suggestion endpoint (`suggestqueries.google.com`) about a limited number of them (12 requests for the whole check, one at a time with 0.7 s between, as ArablyzerBot, with the answer kept for a day). A form counts as typed by people when a suggestion begins with it.
4. We compare what people type with the page's words as written (its text, title, description, headings and image alt texts).
5. That endpoint is not documented for automated use and we have no agreement with it, so the check is off unless the operator turns it on with `ARABLYZER_SUGGEST=1`, and stops at the first answer it cannot read. It is a minor finding.

## References

- [Google: how autocomplete works](https://support.google.com/websearch/answer/7368877)
- [Wikipedia: Arabic chat alphabet (Arabizi)](https://en.wikipedia.org/wiki/Arabic_chat_alphabet)
