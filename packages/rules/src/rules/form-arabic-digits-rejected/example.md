```html wrong
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{8}" placeholder="9xxxxxxx" required />
```

```html right
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="(\+968)?[0-9٠-٩]{8}" placeholder="9xxxxxxx" required />
```
