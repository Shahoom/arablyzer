# hreflang list has no x-default

## Messages

### missing

The page lists {count} versions in hreflang but no `x-default`, the address for visitors of every other language or region.

## Why it matters

- `x-default` tells Google which version to show a visitor whose language or country none of the listed versions fits: a visitor from Egypt, to a store that lists ar-SA and ar-AE only.
- Google calls it recommended, not required, so this is minor: without it Google picks a version itself.
- It is usually the language-selector page or the version meant for everyone else.

## How to fix

Add one `x-default` link to the same list on every version, to the page meant for everyone else:

```html
<link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
<link rel="alternate" hreflang="x-default" href="https://shop.example/offers" />
```

If your store has one version for the whole world (an Arabic store with a single page), you need none of this: hreflang is for pages with more than one version.

## How we detect

1. We read the page's `<link rel="alternate" hreflang>` elements and its Link headers.
2. When they list two or more different codes (not counting `x-default`) and none of them is `x-default`, in any letter case, the page lacks one.

## References

- [Google Search Central: Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search Central Blog: x-default hreflang for international pages](https://developers.google.com/search/blog/2013/04/x-default-hreflang-for-international-pages)
