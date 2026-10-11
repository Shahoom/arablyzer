---
summary: Can an Arabic customer fill your checkout: a name like «محمد», an Arabic address, a phone in Arabic digits, and autofill?
---

# Arabic checkout form test

Reads the form on a checkout, sign-up or contact page and tests its fields' rules the way a customer would meet them: a name written in Arabic («محمد»), a street and a city in Arabic, a phone typed with Arabic digits, and the autofill tokens a phone needs. It never types in a field and never submits the form.

## What it checks

- That a name field's `pattern` accepts Arabic names such as «محمد», «عبد الله» and «فاطمة», including the hamza, the ta marbuta and the space, and not Latin letters only.
- That an address or city field's `pattern` accepts an Arabic city, district and street, with their punctuation.
- That a phone field accepts Arabic-Indic digits as well as 0–9, or says clearly what it expects.
- That fields asking for a name, email, phone, street, city or postal code have an `autocomplete` token, so a phone fills them in one tap.

## Example

### Wrong

```html
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" pattern="[A-Za-z ]{3,40}" />
<label for="city">المدينة</label>
<input id="city" name="city" pattern="[A-Za-z ]{2,40}" />
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" pattern="[0-9]{8}" />
<label for="email">البريد الإلكتروني</label>
<input id="email" name="email" type="email" />
```

### Right

```html
<label for="name">الاسم الكامل</label>
<input id="name" name="full_name" autocomplete="name" pattern="[\p{L}\p{M} '\-]{2,60}" />
<label for="city">المدينة</label>
<input id="city" name="city" autocomplete="address-level2" pattern="[\p{L}\p{M} \-]{2,40}" />
<label for="phone">رقم الجوال</label>
<input id="phone" name="phone" type="tel" autocomplete="tel" pattern="[0-9٠-٩]{8}" />
<label for="email">البريد الإلكتروني</label>
<input id="email" name="email" type="email" autocomplete="email" />
```

## How to fix

1. Let name and address fields take any letters: `[\p{L}\p{M} '\-]{2,60}` for a name; add `\p{N}` and the commas for a street. Or drop the `pattern` and let the server decide.
2. For a phone, accept `[0-9٠-٩]` or turn Arabic digits into 0–9 in the page's script before checking, and show the format the field expects.
3. Add the token for each field: `name`, `email`, `tel`, `street-address`, `address-level2`, `postal-code`, with `shipping` or `billing` before it when both are on the page.
4. Test the checkout yourself with an Arabic keyboard: type a name, a district and a phone on your phone.
5. On Salla, Zid and Shopify the checkout is the platform's, and its fields are not yours to change. If your own form or page has the problem, fix it in the theme or app that makes it; if it is the platform's checkout, report it to the platform with this result.

## FAQ

### Why does the tool not type in my form?

Because typing in a form can create orders, accounts and emails. The tool reads the fields' attributes and tests the patterns on sample values in its own sandbox. Nothing is ever sent.

### Will it find a problem in a checkout that appears after I click?

No. It reads the form in the HTML the server sends. A checkout that opens in a pop-up, or is drawn by a script after the page loads, is not in that HTML. Give the address of the checkout page itself when it has one.

### My customers type Arabic digits in the phone field. Is that wrong?

No. A customer with an Arabic keyboard types Arabic-Indic digits, and a phone field that refuses them blocks the sale. Accept both, or convert them before checking.

### Does `autocomplete` matter for Arabic customers more?

It matters for everyone on a phone. Typing an address on a small keyboard is where an Arabic order is most often abandoned, and one tap with a saved address avoids it.

## Methodology

We read the form fields in the page's HTML as the server sends it, and run each `pattern` as a browser does, on Arabic samples and their Latin equivalents of the same length: ten names, five addresses and a phone number in Eastern Arabic digits. A pattern is faulted only when it refuses the Arabic one and accepts the Latin one, so a legitimate limit on length does not count. See each rule's page for the details.
