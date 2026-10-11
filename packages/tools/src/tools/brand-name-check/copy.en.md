---
summary: Is your brand's name written the same way in your title, schema, logo and footer, in Arabic and in Latin letters?
---

# Brand name consistency checker

Reads the places a page names its brand, `og:site_name`, the Organization and WebSite structured data, the logo's alt text and the copyright line, and checks that they say the same name, in Arabic spelling and in Latin letters. Search engines and AI assistants build one entity from them.

## What it checks

- That the brand's name is the same in `og:site_name`, the JSON-LD `name`, the logo's `alt` and the copyright line, once hamza, ta marbuta, alef maqsura, tatweel and harakat are folded.
- That the same name is not spelled two ways, such as «متجر الواحة» and «متجر الواحه».
- That when a page names its brand in Arabic and in Latin letters, the structured data pairs them with `alternateName`.

## Example

### Wrong

```html
<meta property="og:site_name" content="متجر الواحه" />
<script type="application/ld+json">
  { "@context": "https://schema.org", "@graph": [ { "@type": "Organization", "name": "Al Waha Store", "url": "https://www.example.com/" }, { "@type": "WebSite", "name": "متجر الواحة", "url": "https://www.example.com/" } ] }
</script>
```

### Right

```html
<meta property="og:site_name" content="متجر الواحة" />
<script type="application/ld+json">
  { "@context": "https://schema.org", "@graph": [ { "@type": "Organization", "name": "متجر الواحة", "alternateName": ["Al Waha Store"], "url": "https://www.example.com/" }, { "@type": "WebSite", "name": "متجر الواحة", "url": "https://www.example.com/" } ] }
</script>
```

## How to fix

1. Choose one spelling of the Arabic name and one of the Latin name, and use them everywhere: the store settings, the logo's alt, the SEO app, the footer.
2. Give the Organization's `name` in Arabic and its Latin name in `alternateName`, so search engines know they are the same.
3. Keep `og:site_name` the same as the WebSite's `name`.
4. Write ة and ه, ى and ي, and the hamza forms of alef the same way in every place.
5. On Salla, Zid and Shopify, the store name comes from the store settings and the SEO app; set it once in each and review the logo's alt text.

For example:

```json
"@type": "Organization",
"name": "متجر الواحة",
"alternateName": ["Al Waha Store"]
```

## FAQ

### Why does Google care about the brand's name?

It builds one entity for the brand from the names it finds, and shows it in knowledge panels and site names. Names that differ split the entity or make it unsure.

### Is the Latin name wrong if the page is in Arabic?

No. Both names are right. The check asks that structured data pairs them with `alternateName`, so they are one brand.

### What if my company and my store have different names?

That is allowed. The check holds the company's names together (Organization and the copyright line) and the site's together (WebSite, `og:site_name`, the logo), and does not hold one against the other.

### Does it compare an Arabic name with its transliteration?

No. That would need transliteration, which can disagree. It only asks that you pair them.

## Methodology

We read the names from `og:site_name`, the `name` and `alternateName` of Organization and WebSite in JSON-LD, the alt text of logo images and the copyright line; the title and the first heading are read for mentions of the name. Arabic is folded (hamza forms of alef, ta marbuta and ha, alef maqsura and ya, tatweel, harakat) and Latin ignores case, punctuation and spaces. See the rule's page for the details.
