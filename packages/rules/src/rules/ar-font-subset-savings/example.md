```css wrong
/* The whole font file, 140 KB, for a handful of letters. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/ibm-plex-sans-arabic-400.ttf') format('truetype');
  font-display: swap;
}
```

```css right
/* A WOFF2 file of a size the page can carry. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.woff2') format('woff2');
  font-display: swap;
}
```
