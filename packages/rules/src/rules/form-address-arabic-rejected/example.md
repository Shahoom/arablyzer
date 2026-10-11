```html wrong
<label for="city">المدينة</label>
<input id="city" name="city" autocomplete="address-level2" pattern="[A-Za-z ]{2,40}" />
```

```html right
<label for="city">المدينة</label>
<input id="city" name="city" autocomplete="address-level2" pattern="[\p{L}\p{M} \-]{2,40}" />
```
