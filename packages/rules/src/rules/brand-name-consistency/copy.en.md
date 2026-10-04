# Brand name written in different ways

## Messages

### disagree

The brand's name differs between two places on the page: «{first}» in {firstSource} and «{second}» in {secondSource}.

### spelling

The same brand name is spelled two ways: «{first}» in {firstSource} and «{second}» in {secondSource}. The difference is in the hamza, ta marbuta, alef maqsura or diacritics, not in the name.

### alternate-missing

The page names its brand in Arabic, «{arabic}» (in {arabicSource}), and in Latin letters, «{latin}» (in {latinSource}), and no alternateName in its structured data pairs them.

## Why it matters

- **Search engines and AI assistants build one entity for a brand** from its names in the page, the structured data and the links. Two names read as two entities, and visibility is split between them.
- **Arabic readers write a name in many ways**: «الواحة» and «الواحه», «إكسترا» and «اكسترا». When the page itself spells the name two ways, an algorithm cannot tell which one is the name.
- **Someone who searches in Arabic may search in Latin letters next, and the other way round.** The alternateName field is what tells Google that «متجر الواحة» and «Al Waha Store» are one brand.

## How to fix

- Choose one spelling of the name in Arabic and one in Latin letters, and use them in the title, og:site_name, the structured data, the logo's alt text and the footer's copyright line.
- Write the Arabic name with the same hamza, ta marbuta and alef maqsura everywhere, as the brand wants them.
- Pair the two forms in the organization's data:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "متجر الواحة",
  "alternateName": ["Al Waha Store"],
  "url": "https://www.example.com/"
}
```

## How we detect

1. We read the names from: og:site_name, name and alternateName of the Organization and WebSite JSON-LD, the alt text of logo images and the page's copyright line; the title and the h1 are read for mentions of the name.
2. Arabic is folded: hamza forms of alef, ta marbuta and ha, alef maqsura and ya, tatweel and diacritics are made one. Latin ignores case, punctuation and spaces.
3. Each name is held against the most trusted name of its script and kind: the company's names together (Organization and the copyright line) and the site's together (WebSite, og:site_name and the logo); a company's name is not held against its site's, since they may differ rightly. A name that differs from it, and is not part of it, is a disagreement; a name that equals it once folded but is written differently is a different spelling. The title and the h1 can show a different spelling only, since they may describe the page rather than name it.
4. We do not compare an Arabic name with a Latin one (that would need transliteration); we ask only that the structured data pairs them when the page names its brand in both.
5. It is a minor finding.

## References

- [Google: Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Schema.org: alternateName](https://schema.org/alternateName)
