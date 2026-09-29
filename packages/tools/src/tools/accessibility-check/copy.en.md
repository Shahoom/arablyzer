---
summary: Can screen reader users and people with low vision use your page?
---

# Accessibility checker

Checks your page in three browsers with curated axe-core rules for WCAG 2.2: button and link names, image alt text, text contrast, Arabic included, and language codes.

## What it checks

- Every `<button>` has a name a screen reader can read: text, or an `aria-label`, `aria-labelledby` or `title` (WCAG 4.1.2).
- Every link has a name: text, its image's `alt`, or an `aria-label`, `aria-labelledby` or `title` (WCAG 2.4.4 and 4.1.2).
- Every image has a text alternative, or is marked as decorative with `alt=""` or `role="presentation"` (WCAG 1.1.1).
- Text contrasts with its background by at least 4.5:1, or 3:1 for large text, Arabic text included (WCAG 1.4.3).
- Text whose contrast cannot be measured, over images and gradients or under other elements, for you to check by eye.
- Every `lang` attribute inside the page is a valid language code, such as `en`, not `english` (WCAG 3.1.2).

## Example

### Wrong

```html
<h1>عطر العود الملكي</h1>
<button id="wishlist" type="button"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /></svg></button>
```

### Right

```html
<h1>عطر العود الملكي</h1>
<button id="wishlist" type="button" aria-label="أضف إلى المفضلة"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /></svg></button>
<button type="button">أضف إلى السلة</button>
```

## How to fix

Give every button and link a name in the page's language, every image a text alternative, and every passage in another language its language code:

```html
<button type="button" aria-label="أضف إلى المفضلة">
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /></svg>
</button>
<a href="/cart" aria-label="السلة">
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" /></svg>
</a>
<img src="oud.jpg" alt="زجاجة عطر العود الملكي، 50 مل" />
<img src="divider.png" alt="" />
<p>الدفع متاح بـ <span lang="en">Apple Pay</span></p>
```

- Keep `aria-hidden="true"` on the icon itself, so it is not read twice, and write an empty `alt=""` for an image that only decorates, so screen readers pass over it.
- Darken the text or lighten the background until the contrast reaches 4.5:1; on white, `#767676` is the lightest grey that does. Check the colours of placeholders and links too.
- For text over an image, put a solid or semi-transparent layer between them, such as `background: rgb(0 0 0 / 60%)` behind white text, or move the text onto a plain background.

## FAQ

### Does a passing result mean my page conforms to WCAG?

No. The tool runs five curated axe-core rules, and many WCAG 2.2 criteria need a person's judgement, such as whether a text alternative really says what the image shows. A passing result means the page is free of what these rules check, in all three browsers.

### Does the tool check the contrast of Arabic text?

Yes. axe-core, the engine behind many accessibility checks, leaves out Arabic text: it takes Arabic sentences for the ligatures of icon fonts, and after three of them it leaves out all the text in that font. Before it runs, we tell it that the fonts of Arabic text are not icon fonts, so it measures Arabic text like any other.

### Why does the tool ask me to check some text myself?

Because axe-core cannot measure the contrast of text over an image or a gradient, or covered by another element, so we list it for you to check by eye, with the reason. WCAG 2.2's contrast requirement holds for this text too, but this result does not lower the score.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, then render it in Chromium, Firefox and WebKit, each behind Arablyzer's egress proxy, and run axe-core 4.13.0's `button-name`, `link-name`, `image-alt`, `color-contrast` and `valid-lang` rules in each engine. Before axe runs, we tell it that the fonts of Arabic text are not icon fonts, so it measures Arabic text too. We report each failing element once, with the engines that found it. Text whose contrast axe could not measure is listed for review and does not lower the score. The same page gives the same result on every check.
