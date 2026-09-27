# Name field rejects Arabic names

## Messages

### rejected

This name field accepts «{accepted}» but rejects «{name}»: its pattern `{pattern}` does not allow every Arabic letter.

## Why it matters

- A field's `pattern` decides what the browser lets people send. When a name field allows Latin letters only, such as `[A-Za-z ]+`, someone who types their name in Arabic cannot send the form: the browser stops it and asks them to match the requested format, without saying that Arabic is the problem.
- Ranges such as `[ا-ي]` look like the whole alphabet but leave out the letters that come before ا in Unicode: ء أ إ آ ؤ ئ. «محمد» passes, and «أحمد» and «إياد» do not.
- Names are asked for in sign-up, checkout, booking and contact forms; a person who cannot get past the name field cannot finish them.

## How to fix

- Allow the letters of every script with Unicode properties, which browsers understand in `pattern`: `pattern="[\p{L}\p{M} '\-]{2,60}"`. `\p{M}` keeps harakat such as the shadda.
- Or drop the pattern and limit the length with `minlength` and `maxlength`.
- If you also need the name in Latin letters, for a passport or a payment card, ask for it in a field of its own that says so.
- Accept the same names on the server.

## How we detect

1. We find text fields for a person's name: `autocomplete` `name`, `given-name`, `additional-name`, `family-name` or `nickname`, or a name, id, label or placeholder that names a name («الاسم»، «اسم العائلة»، name، first_name…). We leave out user names, company, card and bank names, and fields that ask for the name in English or as in the passport.
2. We check the field's `pattern` as browsers do, with the `v` flag, against Arabic names («محمد العبري»، «عبد الله»، «فاطمة»، «أحمد»، «آمنة»، «يحيى»…) and Latin names of the same length and number of words.
3. A field fails when it rejects an Arabic name but accepts a name of the same shape, Latin or Arabic. A pattern that rejects every name of a shape, for example one that allows no spaces, is not about Arabic, and does not fail here. Patterns that do not compile are ignored, as browsers ignore them, and so are patterns that take too long to run.
4. We check Arabic pages only: those whose `<html lang>` is Arabic or whose text is mostly Arabic.

## References

- [HTML Standard: The pattern attribute](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute)
- [MDN: HTML attribute: pattern](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/pattern)
- [MDN: Unicode character class escape: \p{...}](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape)
- [W3C: Personal names around the world](https://www.w3.org/International/questions/qa-personal-names)
