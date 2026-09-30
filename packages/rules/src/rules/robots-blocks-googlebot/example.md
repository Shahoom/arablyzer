```robots.txt wrong
# Keep Google out while the new store is being built
User-agent: Googlebot
Disallow: /
```

```robots.txt right
User-agent: *
Disallow: /admin/
```
