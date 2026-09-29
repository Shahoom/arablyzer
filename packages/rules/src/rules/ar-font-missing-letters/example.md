```css wrong
/*
 * An Arabic web font subset without «ڤ» and the Arabic-Indic digits, set for text that
 * uses them: the browser draws those in another font, in the middle of the words.
 */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic-partial.woff2') format('woff2');
  font-display: swap;
}
```

```css right
/* The whole font: it has «ڤ» and the Arabic-Indic digits the text uses. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.woff2') format('woff2');
  font-display: swap;
}
```
