---
summary: Does the number show left to right, as it is typed?
---

# Phone field checker

Renders your page in three browsers and checks that each phone field shows left to right, so a typed number keeps its order and its country code stays at the start.

## What it checks

- Every phone field on the page is shown left to right in Chromium, Firefox and WebKit, so `+968 9123 4567` shows as it is typed, not as `4567 9123 968+`.
- Phone fields by their `type="tel"`, by `inputmode="tel"` or an `autocomplete` for a phone number, or by a name, id, label or placeholder that names a phone, such as «هاتف», «جوال», «واتساب», phone and mobile.
- A field with `dir="auto"` or `unicode-bidi: plaintext` passes, since it takes its direction from what is typed.
- Number fields (`type="number"`) do not count: they hold digits alone, which keep their order.

## Example

### Wrong

```html
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" inputmode="tel" autocomplete="tel" />
```

### Right

```html
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" dir="ltr" autocomplete="tel" />
```

## How to fix

Use `type="tel"` for phone fields, which also opens the phone keypad on phones, and add `dir="ltr"` so every browser shows the number left to right:

```html
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" dir="ltr" autocomplete="tel" />
<style>
  #phone {
    text-align: right;
  }
</style>
```

- `text-align: right` keeps the field aligned with the Arabic page, with the number inside still left to right.
- `dir="auto"` works too: the field takes its direction from what is typed.

## FAQ

### Why does the number show reversed in a phone field?

In a field shown right to left, the groups of a phone number are laid out from right to left: the country code moves to the end, and the groups swap places, so `+968 9123 4567` shows as `4567 9123 968+`. People think they typed it wrong, and change a number that was right.

### Is `type="tel"` alone not enough?

In the three engines we test, a `type="tel"` field is shown left to right on right-to-left pages, so the tool passes it unless the page's CSS changes its direction. A phone field written as `type="text"`, even with `inputmode="tel"`, takes the page's direction. `dir="ltr"` makes it explicit for every browser.

### Is the number stored reversed?

No. The number is stored in the order it was typed; the problem is how it shows while it is typed. The reversed display can still lead someone to change a number that was right.

## Methodology

We fetch the page as `ArablyzerBot` and render it in Chromium, Firefox and WebKit, with every request going through a proxy that refuses private addresses. For each input we read its type, name, id, `autocomplete`, `inputmode`, label and placeholder, and its computed direction once CSS is applied. A phone field fails when its computed direction is right to left, without `dir="auto"` or `unicode-bidi: plaintext`. We read labels and placeholders word by word, so a word such as «iPhone» or «جوالات» does not make a field a phone field, and we leave out search boxes and message fields. We never type into fields or submit the form. The same page gives the same result on every check.
