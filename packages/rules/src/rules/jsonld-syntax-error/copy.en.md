# JSON syntax error in structured data (JSON-LD)

## Messages

### trailing-comma

JSON-LD block {block} has a comma before a closing bracket on line {line}, which JSON does not allow.

### unexpected-character

JSON-LD block {block} stops being valid JSON on line {line}, column {column}, at "{character}", for example because of an unescaped quote inside a text value.

### control-character

JSON-LD block {block} has a line break or control character inside a text value on line {line}; write it as `\n` or remove it.

### invalid-escape

JSON-LD block {block} has an invalid escape after `\` on line {line}.

### unexpected-end

JSON-LD block {block} ends before the JSON is complete; a closing bracket or quote is missing.

## Why it matters

- Google reads structured data from JSON-LD blocks to show rich results, such as business details, prices and ratings.
- When a block is not valid JSON, Google cannot read anything in it: the whole block is ignored, not just the broken line. Search Console lists this case in its "Unparsable structured data" report.
- Known causes: an extra comma after the last item, a quote inside an Arabic name such as `مطعم "الأصيل"` left unescaped, and a line break inside a text value.

## How to fix

- Remove the comma before `}` or `]`.
- Escape a quote inside text as `\"`, or use the Arabic quotation marks «», which need no escaping:

```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "مطعم \"الأصيل\" للمأكولات البحرية"
}
```

- Better still, generate the block with your language's JSON encoder, such as `JSON.stringify` in JavaScript or `json_encode` in PHP, instead of writing it as text by hand.
- After the fix, test the page with Google's Rich Results Test or the Schema.org validator.

## How we detect

1. We collect every `<script type="application/ld+json">`, in any letter case and with any parameters after the type, and skip empty blocks.
2. We check each block strictly against the JSON specification (RFC 8259), and find the kind of error and its place in the page by line and column.
3. Blocks are numbered in their order among the page's JSON-LD blocks; each broken block gives one finding, at its first error.

This rule checks the syntax only; whether the Schema.org types and properties are right is a separate check.

## References

- [RFC 8259: The JSON Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259.html)
- [Google: Introduction to structured data markup in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Schema.org validator](https://validator.schema.org/)
- [W3C: JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
