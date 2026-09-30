```css wrong
/* The font file was renamed on the server; this address now answers 404. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/fonts/brand-arabic.woff2') format('woff2');
  font-display: swap;
}
```

```css right
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.ttf') format('truetype');
  font-display: swap;
}
```
