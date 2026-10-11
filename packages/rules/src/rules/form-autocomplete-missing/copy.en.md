# Form field has no autocomplete token

## Messages

### missing

The field “{field}” asks for something a browser can fill in, but has no `autocomplete` that says what; add `autocomplete="{token}"`.

## Why it matters

- With the right `autocomplete`, a browser or a password manager fills a checkout's name, phone, email and address from the customer's saved details: a few taps on a phone instead of typing an address on an Arabic keyboard.
- WCAG 2.2 asks for it for fields that collect the user's own information (1.3.5 Identify Input Purpose, level AA): it also lets assistive technology show an icon for the field's purpose.
- `autocomplete="off"` on these fields removes the help; this check does not flag it, since the field may be for someone else's details, but think twice before using it on a customer's own.
- Fewer typing errors, fewer abandoned checkouts: this is the cheapest checkout fix there is.

## How to fix

Name each field's purpose with a token from the HTML standard:

```html
<input id="name" name="full_name" autocomplete="name" />
<input id="email" name="email" type="email" autocomplete="email" />
<input id="phone" name="phone" type="tel" autocomplete="tel" dir="ltr" />
<input id="city" name="city" autocomplete="address-level2" />
<input id="street" name="street" autocomplete="street-address" />
<input id="zip" name="zip" autocomplete="postal-code" />
```

- Use `shipping` or `billing` before the token when a page has both: `autocomplete="shipping street-address"`.
- Remove `autocomplete="off"` from fields that ask for the customer's own details.
- In the store platform's theme, the checkout template sets these; a theme update or the checkout settings usually does it.

## How we detect

1. We find the fields whose purpose is clear: `type="email"` or `type="tel"`, or a name, id or label that says name, email, phone, city, street or postal code (in Arabic or English). Fields for a user name, a company, a card holder or a coupon are left out.
2. A field is flagged when it has no `autocomplete` at all. Any value counts, `off` included (it may be a field for someone else's details), and we do not check that the token is the right one.

## References

- [W3C: Understanding Success Criterion 1.3.5 Identify Input Purpose](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)
- [HTML Standard: Autofill](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)
- [MDN: The autocomplete attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete)
