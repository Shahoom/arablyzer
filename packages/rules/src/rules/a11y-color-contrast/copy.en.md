# Text with too little contrast

## Messages

### low

This text's contrast is {ratio}:1 ({foreground} on {background}), below the {expected}:1 WCAG asks for text of its size.

## Why it matters

- Light grey text on white, or text in a colour close to its background, is hard to read for people with low vision, for many older readers, and for anyone reading a phone in sunlight.
- WCAG 2.2 asks for a contrast of at least 4.5:1 between text and its background, or 3:1 for large text: 18 points, or 14 points in bold (success criterion 1.4.3, level AA).
- axe-core, the engine behind many accessibility checks, leaves out Arabic text: it takes Arabic sentences for the ligatures of icon fonts, and after three of them it leaves out all the text in that font. Arablyzer corrects this, so Arabic text is checked like any other.

## How to fix

- Darken the text or lighten the background until the contrast reaches 4.5:1. On white, #767676 is the lightest grey that does.
- Check the colours of placeholders and links too.
- Measure the colours with a contrast checker, such as WebAIM's.

## How we detect

1. We render the page and run axe-core 4.13.0's `color-contrast` rule in each engine: it measures each text's colour against the background behind it.
2. Before axe runs, we tell it that the fonts of Arabic text are not icon fonts, so it measures Arabic text too.
3. A text fails below 4.5:1, or below 3:1 when it is large. Text axe cannot measure, such as text over an image, is left to the rule a11y-color-contrast-review.

## References

- [W3C: Understanding WCAG 2.2, Contrast (Minimum) (1.4.3)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WebAIM: Contrast checker](https://webaim.org/resources/contrastchecker/)
- [axe-core: color-contrast](https://dequeuniversity.com/rules/axe/4.13/color-contrast)
