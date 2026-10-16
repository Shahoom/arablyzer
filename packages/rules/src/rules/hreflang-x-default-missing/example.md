```html wrong
<link rel="alternate" hreflang="ar-SA" href="https://shop.example/sa/offers" />
<link rel="alternate" hreflang="ar-AE" href="https://shop.example/ae/offers" />
<link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
</head>
```

```html right
<link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
<link rel="alternate" hreflang="x-default" href="https://shop.example/offers" />
</head>
```
