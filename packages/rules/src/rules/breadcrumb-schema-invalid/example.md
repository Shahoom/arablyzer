```json wrong
{ "@type": "ListItem", "position": "١", "name": "الرئيسية", "item": "/" },
{ "@type": "ListItem", "position": 2, "item": "https://www.example.com/perfumes" },
```

```json right
{ "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://www.example.com/" },
{ "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" },
```
