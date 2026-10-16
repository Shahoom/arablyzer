```json wrong
"telephone": "٩٦٨٩١٢٣٤٥٦٧+",
"openingHoursSpecification": {
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["السبت", "الأحد"],
  "opens": "9:00 ص",
  "closes": "21:00"
}
```

```json right
"telephone": "+96891234567",
"openingHoursSpecification": {
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Saturday", "Sunday"],
  "opens": "09:00",
  "closes": "21:00"
}
```
