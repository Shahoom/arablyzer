---
summary: Which Gulf payment methods does your page show: mada, Apple Pay, STC Pay, Tabby and Tamara?
---

# Gulf payment methods detector

Reads your page and lists the Gulf payment methods it shows, of mada, Apple Pay, STC Pay, Tabby and Tamara, from their logos' names and their providers' scripts, without clicking anything or starting a payment.

## What it checks

- Payment methods' logos by their names: an image's `alt`, an SVG icon's `<title>`, and `aria-label`, when the name is the method's alone, or with a word such as `logo`.
- The providers' scripts, from the hosts their guides give: Tabby's message from `checkout.tabby.ai`, Tamara's widget from `cdn.tamara.co`, and Apple's Apple Pay button from `applepay.cdn-apple.com`.
- The result is information, never deducted: it lists each method once, with the first place the page shows it.

## Example

### Wrong

```html
<p>طرق الدفع:</p>
<img src="/pay/mada.svg" />
<img src="/pay/apple-pay.svg" alt="" />
```

### Right

```html
<p>طرق الدفع:</p>
<img src="/pay/mada.svg" alt="مدى" />
<img src="/pay/apple-pay.svg" alt="Apple Pay" />
```

## How to fix

Name each payment method's logo in its text alternative, so a screen reader knows it as the detector does: WCAG asks that all non-text content have a text alternative that serves the same purpose, and a logo without a name says nothing to those who cannot see it.

- An image: `alt="مدى"` or `alt="Apple Pay"`, or with a word such as `alt="mada logo"`.
- An SVG icon: a `<title>` inside it, or `aria-label`.
- Tabby's and Tamara's messages: use the script each gives in its guide, as it is. Both ask for their message to show near the price on the product page, and near the total in the cart.

## FAQ

### Why does the detector not find a payment method I show?

For one of these reasons: its logo has no name in a text alternative; its name is only in the page's text, which we do not read for names, since «مدى» is a common Arabic word; a script adds it after loading; or it shows on the payment page alone, and we never start a payment.

### Does the detector check that the payment method works?

No. We click nothing, submit no form and start no payment: the result says what the page shows, not what the payment page accepts.

### Why is the result not deducted from the score?

Because it is information: showing a payment method or not is not a fault in itself, so the detector lists and does not judge.

### Does it find other payment methods, such as Visa?

No. It finds the five methods it is made for: mada, Apple Pay, STC Pay, Tabby and Tamara.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects and read its HTML as the server sends it, before JavaScript runs, and we click nothing, submit no form and start no payment. We read images' text alternatives, SVG icons' `<title>`, and `aria-label`, and count a name as naming a payment method when it is the method's name alone, in Arabic or Latin letters and any letter case, without spaces or hyphens, or with a word such as `logo` or «شعار». We know Tabby's and Tamara's messages and Apple's Apple Pay button by a script the page loads from the host the provider's guide gives. We do not read the names in the page's text. Each method is named once, where the page first shows it, and the result is information, never deducted. The same page gives the same result every time.
