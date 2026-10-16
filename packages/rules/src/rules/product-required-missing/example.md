```json wrong
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي"
}
```

```json right
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي",
  "image": "https://www.example.com/royal-oud.jpg",
  "offers": {
    "@type": "Offer",
    "price": "120.00",
    "priceCurrency": "SAR",
    "availability": "https://schema.org/InStock"
  }
}
```
