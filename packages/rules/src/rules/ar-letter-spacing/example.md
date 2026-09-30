```css wrong
/* A heading style carried over from a Latin design. */
.title {
  letter-spacing: 0.1em;
}
```

```css right
.title {
  letter-spacing: 0.1em;
}
/* Latin headings keep their spacing; Arabic text keeps its joins. */
:lang(ar) {
  letter-spacing: 0;
}
```
