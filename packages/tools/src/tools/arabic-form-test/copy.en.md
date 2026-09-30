---
summary: Does the field accept the name «محمد» and Eastern Arabic digits?
---

# Arabic form checker

Tests the fields of your forms without submitting them: whether name fields accept Arabic names, number fields Eastern Arabic digits, and every field has a label.

## What it checks

- A name field's `pattern` accepts Arabic names such as «محمد العبري», «أحمد» and «آمنة», as it accepts Latin names of the same length and number of words.
- Ranges such as `[ا-ي]`, which leave out ء أ إ آ ؤ ئ, so «محمد» gets through and «أحمد» does not.
- The `pattern` of number fields, such as a phone number, a verification code or a postal code, accepts Eastern Arabic digits `١٢٣` as it accepts Western digits `123`.
- Every input and textarea has a name that screen readers read: a `<label>` tied to it, `aria-label`, `aria-labelledby`, `title` or a placeholder.

## Example

### Wrong

```html
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" autocomplete="name" pattern="[A-Za-z ]{3,40}" required />
```

### Right

```html
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" autocomplete="name" pattern="[\p{L}\p{M} '\-]{2,60}" />
```

## How to fix

Allow the letters of every script in a name field's pattern, with the Unicode properties browsers understand in `pattern`, and accept in number fields the digits people type:

```html
<label for="name">الاسم الكامل</label>
<input id="name" name="name" autocomplete="name" pattern="[\p{L}\p{M} '\-]{2,60}" />

<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" autocomplete="tel" pattern="[0-9٠-٩۰-۹]{8}" dir="ltr" />
```

- `\p{L}` accepts the letters of every script, and `\p{M}` keeps harakat such as the shadda. Or drop the pattern and limit the length with `minlength` and `maxlength`.
- `[0-9٠-٩۰-۹]` accepts Western, Eastern Arabic and Persian digits, and `\p{Nd}` the decimal digits of every script. Then convert the digits to Western ones before you check or store the number, and accept the same names on the server.
- If you need the name in Latin letters, for a passport or a payment card, ask for it in a field of its own whose label says so.
- Tie every field to its label: `<label for="email">` with `id="email"` on the field, or the field inside its `<label>`. For a field without visible text, such as a search box, use `aria-label`.

## FAQ

### Does the tool submit the form or type into it?

No. Arablyzer never submits forms, types into their fields, or presses Enter or buttons. We read each field's pattern from the page's HTML and test names and numbers against it as the browser does when it validates the field, and we check the fields' labels on the rendered page without touching them.

### Why does the field accept «محمد» but reject «أحمد»?

Because its pattern uses a range such as `[ا-ي]`. The range looks like the whole alphabet, but it starts at alef in Unicode, and ء أ إ آ ؤ ئ come before it, so they fall outside: «محمد» gets through, and «أحمد» and «إياد» do not. Use `\p{L}` instead.

### My field asks for the name in English, as in the passport. Does it fail?

No. We leave out fields that ask for the name in English or as in the passport, and user name, company, card and bank name fields; we recognise them by `autocomplete` and by the field's name, label and placeholder. So say it in the field's label, such as «الاسم بالإنجليزية كما في الجواز».

### Why does the field reject Eastern Arabic digits?

Because `\d` and `[0-9]` in a pattern match Western digits only. Arabic keyboards, especially on phones, can type Eastern Arabic digits, and numbers copied from Arabic text carry them, so the browser stops the form with a message that only asks to match the requested format.

## Methodology

Arablyzer never submits a form. We fetch the page as `ArablyzerBot` and read its fields in the HTML as the server sends it: a name field by its `autocomplete`, such as `name`, `given-name` or `family-name`, or by its name, id, label or placeholder, and a number field by `type="tel"`, `inputmode`, `autocomplete` or a pattern made of digits only. We test each field's pattern as the browser does, the whole value with the `v` flag: with Arabic names and Latin names of the same length and number of words, and with Western-digit numbers and the same numbers in Eastern Arabic digits. Patterns that do not compile are ignored, as browsers ignore them, and so are patterns that take too long to run. We test patterns on Arabic pages only: those whose `<html lang>` is Arabic or whose text is mostly Arabic. Then we render the page in Chromium, Firefox and WebKit and run axe-core 4.13.0's `label` rule on its fields; lists (`<select>`) are a different rule, which we do not run yet. The same page gives the same result on every check.
