```css wrong
/* A web font without the Saudi Riyal sign, set for a price that shows it. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.woff2') format('woff2');
  font-display: swap;
}
```

```css right
/* A web font that has the Saudi Riyal sign. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic-riyal.woff2') format('woff2');
  font-display: swap;
}
```
