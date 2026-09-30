# Text whose contrast needs checking by eye

## Messages

### image

This text sits over an image, whose colours behind each letter cannot be measured; check by eye that it is easy to read.

### gradient

This text sits over a gradient; check by eye that it is easy to read where the gradient is lightest.

### overlap

Another element covers this text or its background, so its contrast cannot be measured; check it by eye.

### other

axe-core could not measure this text's contrast ({reason}); check by eye that it is easy to read.

## Why it matters

- Banners and offers often put text over photos and gradients, and that is often where contrast is lowest: a light word over a light part of the photo disappears.
- WCAG 2.2's contrast requirement (1.4.3) holds for this text too, but tools cannot measure it reliably, so a person has to look.
- This rule asks for a review only; it does not lower the score.

## How to fix

- Put a solid or semi-transparent layer between the image and the text, such as `background: rgb(0 0 0 / 60%)` behind white text.
- Or move the text off the image, onto a plain background.
- Check the text on a phone too, where the image may be cropped differently.

## How we detect

1. axe-core 4.13.0's `color-contrast` rule, run in each engine, reports text whose background it cannot determine: over an image, over a gradient, or behind another element.
2. Each such text is listed for a person to check, with axe's reason: `bgImage`, `bgGradient`, `bgOverlap` and the like.

## References

- [W3C: Understanding WCAG 2.2, Contrast (Minimum) (1.4.3)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [axe-core: color-contrast](https://dequeuniversity.com/rules/axe/4.13/color-contrast)
