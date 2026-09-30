# Invalid hreflang code

## Messages

### underscore

`hreflang="{hreflang}"` separates its parts with an underscore (_); it needs a hyphen (-).

### unknown-language

`hreflang="{hreflang}"`: "{language}" is not an ISO 639-1 language code; those are two letters, such as ar and en.

### unknown-script

`hreflang="{hreflang}"`: "{script}" is not an ISO 15924 script code.

### unknown-region

`hreflang="{hreflang}"`: "{region}" is not an ISO 3166-1 alpha-2 country code; those are two letters, such as SA, AE and OM.

### uk-region

`hreflang="{hreflang}"`: the United Kingdom's ISO 3166-1 code is GB, not UK, so use `{suggestion}`.

### malformed

`hreflang="{hreflang}"` is not in a form Google accepts: a language code, then an optional script code, then an optional country code, or `x-default`.

## Why it matters

- Google uses `hreflang` to show each searcher the version of a page for their language and country, such as the Saudi version to people searching from Saudi Arabia and the English one to people searching in English.
- Google accepts ISO codes only and says that other codes, such as `es-419`, are not supported. Google does not understand an invalid code, so that version may not be shown to the people it was made for.
- Common mistakes on Gulf websites: `KSA` instead of `SA`, `UAE` instead of `AE`, `UK` instead of `GB`, and underscores as in `ar_SA`, which come from some software's locale settings.

## How to fix

Use a two-letter language code, then a two-letter country code when you target one country, joined by a hyphen:

```html
<link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
<link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
<link rel="alternate" hreflang="en" href="https://example.com/en/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/" />
```

- Gulf country codes: Saudi Arabia `SA`, UAE `AE`, Oman `OM`, Kuwait `KW`, Bahrain `BH`, Qatar `QA`.
- `ar` alone means Arabic for every country, and `x-default` marks the version shown when no other version fits the searcher.
- Do not write a country code on its own: `SA` alone is a language (Sanskrit), not Saudi Arabia.

## How we detect

1. We collect `hreflang` values from `<link rel="alternate">` elements on the page and from `Link` headers in the HTTP response.
2. We accept `x-default`, or an ISO 639-1 language code, optionally followed by an ISO 15924 script code, then an ISO 3166-1 alpha-2 country code, in any letter case.
3. The code lists come from the IANA Language Subtag Registry; the country list holds only the officially assigned ISO 3166-1 codes.
4. Each invalid code is its own finding, naming the part at fault and the correction when it is clear.

This rule does not yet check that the linked pages point back to each other; that needs the other pages to be fetched.

## References

- [Google: Tell Google about localized versions of your page](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [ISO 3166 country codes](https://www.iso.org/iso-3166-country-codes.html)
- [ISO 639 language codes](https://www.iso.org/iso-639-language-code)
- [IANA Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)
