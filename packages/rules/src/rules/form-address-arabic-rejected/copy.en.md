# Checkout address field rejects Arabic

## Messages

### rejected

The address field refuses the Arabic address “{address}” and accepts “{accepted}” in Latin letters; its pattern is `{pattern}`.

## Why it matters

- A customer who writes the street, the district or the city in Arabic cannot place the order: the browser says the value does not match the format, often in words the customer cannot read, and the sale ends there.
- The pattern comes from a copied template, a validation snippet from an English-language tutorial, or a courier's requirement for Latin addresses that the form enforces on everyone.
- A Gulf address is Arabic by nature: «حي الروضة»، «شارع الملك فهد»، «مبنى 12». The same test the rule about names makes, with addresses.

## How to fix

Let the field take letters of any script, with digits and the punctuation of addresses:

```html
<label for="city">المدينة</label>
<input id="city" name="city" autocomplete="address-level2" pattern="[\p{L}\p{M} \-]{2,40}" />
```

- `\p{L}` is any letter (Arabic included), `\p{M}` the marks that go on them (harakat), `\p{N}` any digit.
- For the street, add digits and the commas: `[\p{L}\p{M}\p{N} ,.،\-]{5,80}`.
- Better, drop the pattern: let the server validate. Browsers use it to block the order without telling the customer why in a way that fits an Arabic form.
- If the courier needs a Latin address, ask for it in a second field, labelled for it, and leave the Arabic one free.

## How we detect

1. We find the address fields: text inputs with a `pattern` whose `autocomplete` is an address token, or whose name, id or label says address, street, city, district, area, governorate («العنوان»، «الشارع»، «المدينة»، «الحي»…). Email, phone, postal code and country fields are left out.
2. We run the pattern, as a browser does (the whole value, the `v` flag), on five Arabic addresses and their Latin equivalents: «الرياض»، «مسقط»، «حي الروضة»، «شارع الملك فهد، حي العليا»، «مبنى 12، الطابق الثالث».
3. The field fails when it refuses an Arabic one it would take in Latin letters. A pattern that refuses both, such as digits only, is not judged here.

Patterns that take too long to run are skipped, as the rule about names does. We never type in the field and never submit the form.

## References

- [MDN: The pattern attribute of input elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern)
- [W3C: Personal names around the world](https://www.w3.org/International/questions/qa-personal-names)
- [HTML Standard: autocomplete attribute](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)
