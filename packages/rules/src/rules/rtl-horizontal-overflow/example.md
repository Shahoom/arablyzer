```css wrong
.drawer {
  position: absolute;
  top: 0;
  left: -280px;
  width: 260px;
}
```

```css right
.drawer {
  position: absolute;
  top: 0;
  inset-inline-start: -280px;
  width: 260px;
}
```
