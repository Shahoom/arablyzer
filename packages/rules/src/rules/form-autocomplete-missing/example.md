```html wrong
<label for="email">البريد الإلكتروني</label>
<input id="email" name="email" type="email" />
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" autocomplete="off" dir="ltr" />
```

```html right
<label for="email">البريد الإلكتروني</label>
<input id="email" name="email" type="email" autocomplete="email" />
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" autocomplete="tel" dir="ltr" />
```
