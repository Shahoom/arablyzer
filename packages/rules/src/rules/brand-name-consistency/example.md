```html wrong
<meta property="og:site_name" content="متجر الواحه" />
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@graph": [ { "@type": "Organization", "name": "Al Waha Store", "url": "https://www.example.com/" }, { "@type": "WebSite", "name": "متجر الواحة", "url": "https://www.example.com/" } ] }
    </script>
```

```html right
<meta property="og:site_name" content="متجر الواحة" />
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@graph": [ { "@type": "Organization", "name": "متجر الواحة", "alternateName": ["Al Waha Store"], "url": "https://www.example.com/" }, { "@type": "WebSite", "name": "متجر الواحة", "url": "https://www.example.com/" } ] }
    </script>
```
