# lang attribute that names no language

## Messages

### invalid

This element's `lang` attribute is not a language code, so screen readers cannot switch to the right voice for it.

## Why it matters

- Screen readers choose a voice and a pronunciation by `lang`: an English name in Arabic text, marked `lang="en"`, is read with English pronunciation. A value such as `lang="english"` or `lang="arabic"` is not a language code, so nothing changes.
- WCAG 2.2 asks that the language of each passage in another language can be determined (success criterion 3.1.2, level AA).

## How to fix

- Use a language code (BCP 47): `ar` for Arabic, `en` for English, with a region if you need one, such as `ar-OM` or `en-GB`: `<span lang="en">Apple Pay</span>`.

## How we detect

1. We render the page and run axe-core 4.13.0's `valid-lang` rule in each engine.
2. It reports each element inside the page, not `<html>` itself, whose `lang` does not start with a known language code. The `<html>` element's language is checked by the rule ar-html-lang.
3. It does not apply to pages with no `lang` attribute inside them.

## References

- [W3C: Understanding WCAG 2.2, Language of Parts (3.1.2)](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html)
- [W3C: Declaring language in HTML](https://www.w3.org/International/questions/qa-html-language-declarations)
- [axe-core: valid-lang](https://dequeuniversity.com/rules/axe/4.13/valid-lang)
