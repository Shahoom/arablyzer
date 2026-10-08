# Saudi Riyal sign missing from the page's font

## Messages

### lacking

The new Saudi Riyal sign (⃁, U+20C1) is in this page, but its web font «{family}» has no glyph for it, so a visitor's device must draw it, and where the device is not updated to Unicode 17 it shows an empty box in the middle of the price.

## Why it matters

- Saudi Arabia adopted a symbol for the riyal in 2025, and Unicode 17 gave it a code point, U+20C1. A font made before that has no glyph for it.
- The browser draws each character with the first font in the list that has it. A web font that lacks it hands the sign to a font of the visitor's device, which has it only if the operating system has been updated; on an older phone or computer the price shows «150 □».
- It is a new sign, and many visitors are still on devices that lack it, so it is a risk to prices, not yet a fault on every screen.

## How to fix

- Use a font that has the sign: check its character map for U+20C1, or its release notes for Unicode 17 support.
- Or draw the sign as an inline SVG or an image, with the currency code «SAR» as its text alternative, which every device shows the same way:

```html
<span class="price">150 <svg aria-hidden="true" class="sar"><use href="#sar" /></svg><span class="sr-only">SAR</span></span>
```

- Or keep «SAR» or «ر.س» as the text and use the sign only where you control the font.

## How we detect

1. We render the page and find the elements whose own text has U+20C1.
2. For each, we go down its `font-family` list as the browser does and read what each web font file the page loaded covers.
3. The rule fails when the web fonts in the list come before any other font and none of them has the sign: a font of the visitor's device draws it, or an empty box.
4. We do not judge a list that names no web font, since only the visitor's device can say, or a font whose file we could not read.

## References

- [Unicode 17.0: the Currency Symbols block](https://www.unicode.org/charts/PDF/U20A0.pdf)
- [Saudi Central Bank: the Saudi Riyal symbol](https://www.sama.gov.sa/)
