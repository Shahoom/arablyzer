# Arabic web font that did not load

## Messages

### failed

The web font "{family}" set for this Arabic text did not load, so the browser drew the text in another font.

## Why it matters

- **The page no longer looks as designed:** the text appears in whatever Arabic font the visitor's device has, with different letter shapes, widths and line heights, so lines may wrap and buttons may change size.
- **Each device picks a different font.** Phones and computers ship different Arabic fonts, so visitors see different pages, and none of them the one you designed.
- **The browser still asked for the file:** a request that fails is time spent for nothing while the page loads.

## How to fix

Find the font's address in the `src` of its `@font-face` rule, open it, and check that it answers with the font file (HTTP 200). The usual causes:

- The file was renamed or moved, or the path is wrong. A relative path in a CSS file is read from the CSS file's own folder, not from the page's.
- The font is on another domain without an `Access-Control-Allow-Origin` header. Browsers load web fonts under the same cross-origin rules as scripts, so that domain must allow yours.
- The format is one the browser cannot read. WOFF2 works in every current browser.

Then give the text a fallback you have checked with Arabic text, after the web font:

```css
body {
  font-family: 'Brand Arabic', system-ui, sans-serif;
}
```

## How we detect

1. We render the page in a browser and find the elements whose own text has Arabic letters, with the first family in their `font-family`.
2. When that family is one of the page's web fonts, from `@font-face` or added by a script, we read the state of its faces from the browser's list of fonts. Faces whose `unicode-range` leaves out the Arabic letters do not count.
3. The rule fails when a face that covers Arabic letters ended in an error and none of them loaded. A face still loading when our wait ended, or one never asked for, does not count.
4. When Arablyzer's own proxy refused a font request, for example for a blocked address, or the page reached Arablyzer's limit on requests or data, which cuts fonts that are still loading, the failure may not be the site's, so the rule says nothing for that engine.
5. There is one finding per font, at the first element set in it.

## References

- [W3C: CSS Fonts Module Level 4, font fetching requirements](https://www.w3.org/TR/css-fonts-4/#font-fetching-requirements)
- [W3C: CSS Font Loading Module Level 3, the FontFace interface](https://www.w3.org/TR/css-font-loading/#fontface-interface)
