```html wrong
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

```html right
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```
