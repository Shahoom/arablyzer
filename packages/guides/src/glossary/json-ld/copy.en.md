# JSON-LD

JSON-LD is a way to write linked data in JSON. On web pages it carries structured data in a script element, and it is the format Google recommends for it.

## Definition

- JSON-LD 1.1 is a W3C Recommendation, from 2020, that defines a JSON-based format for Linked Data. A JSON-LD document is always valid JSON.
- In HTML it goes in a `<script type="application/ld+json">` element: a data block that the browser does not run and visitors do not see, left for tools such as search engines to read.
- Its keywords start with `@`. `@context` maps short names to full identifiers: with `"@context": "https://schema.org"`, `name` is Schema.org’s name property. `@type` gives an item’s type, `@id` names an item so others can point to it, and `@graph` holds several items in one block.

## Why it matters

- Google reads JSON-LD, Microdata and RDFa equally well when they are valid, but recommends JSON-LD as the easiest to implement and maintain at scale. Unlike the other two, it is not woven into the text visitors see, and Google can read it even when JavaScript adds it to the page.
- Because it is JSON, one syntax error, such as an extra comma, makes the whole block fail to parse.
- Arabic text goes in as it is: JSON allows any Unicode character in a string except the quotation mark, the backslash and control characters. The Arabic quotation marks «» need no escaping, but a `"` inside an Arabic name does.

## Example

A store and its website in one block: `@graph` holds both, and the website points to the store by its `@id`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#store",
      "name": "متجر «الواحة»",
      "url": "https://example.com/"
    },
    {
      "@type": "WebSite",
      "name": "متجر الواحة",
      "url": "https://example.com/",
      "publisher": { "@id": "https://example.com/#store" }
    }
  ]
}
</script>
```

## Common mistakes

- A comma after the last item of an object or a list.
- A `"` or a line break inside a text value, left as it is: write them `\"` and `\n`.
- Comments such as `//` in the block: JSON has none.
- Writing the block by hand instead of generating it with a JSON encoder, such as `JSON.stringify` or `json_encode`.

## References

- [W3C: JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [JSON-LD.org](https://json-ld.org/)
- [Google Search Central: Introduction to structured data markup in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [IETF: RFC 8259, The JSON Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259)
- [HTML Standard: the script element](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)
