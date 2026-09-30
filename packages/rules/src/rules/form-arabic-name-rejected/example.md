```html wrong
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" autocomplete="name" pattern="[A-Za-z ]{3,40}" required />
```

```html right
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" autocomplete="name" pattern="[\p{L}\p{M} '\-]{2,60}" />
```
