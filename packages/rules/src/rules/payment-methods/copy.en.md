# Gulf payment methods on the page

## Messages

### named

The page shows {method}: an image or icon on it is named «{text}».

### widget

The page loads {method}'s own script, from {host}.

## Why it matters

- This is information, never deducted: it says which Gulf payment methods the page shows, of mada, Apple Pay, STC Pay, Tabby and Tamara.
- Tabby and Tamara ask, in their guides, for their message to show near the price on the product page and near the total in the cart, so knowing which pages show it helps a store's owner.
- A logo without a name in a text alternative is known to no screen reader, nor to us: WCAG asks that all non-text content have a text alternative that serves the same purpose.

## How to fix

There is nothing to fix here: the rule lists what the page shows. For a payment method your page shows to be found, name it in its logo's text alternative:

```html
<img src="/pay/mada.svg" alt="مدى" />
<img src="/pay/apple-pay.svg" alt="Apple Pay" />
```

- Name an SVG icon with a `<title>` inside it, or with `aria-label`.
- For Tabby's and Tamara's messages, use the script each gives in its guide, as it is.

## How we detect

1. We read the page's HTML as the server sends it, before JavaScript runs, and click nothing, submit no form and start no payment.
2. We read the names of images and icons: an image's `alt`, an SVG icon's `<title>`, and `aria-label`. A name names a payment method when it is the method's name alone, in any letter case and without spaces or hyphens, or with a word beside it such as `logo`, «شعار» or «بطاقة». So «شعار مدى» names mada, and «على مدى عشرين عاماً» does not.
3. We know Tabby's and Tamara's messages and Apple's Apple Pay button by the script the page loads, when it is from the host the provider's own guide gives: `checkout.tabby.ai` for Tabby, `cdn.tamara.co` for Tamara, and `applepay.cdn-apple.com` for Apple Pay.
4. We do not read the names in the page's text: «مدى» is also a common Arabic word, and a page may speak of a payment method it does not take. What scripts add after loading is not seen.
5. Each method is named once, where the page first shows it. The result is information, never deducted from the score.

## References

- [Tabby: On-site messaging](https://docs.tabby.ai/pay-in-4-custom-integration/on-site-messaging)
- [Tamara: widget implementation guidelines, Saudi Arabia](https://docs.tamara.co/docs/tamara-widget-implementation-guidelines-saudi-arabia)
- [Tamara: Shopify widgets](https://docs.tamara.co/docs/shopify-widgets)
- [Apple: Displaying Apple Pay buttons using JavaScript](https://developer.apple.com/documentation/applepayontheweb/displaying-apple-pay-buttons-using-javascript)
- [W3C: WCAG 2.2, 1.1.1 Non-text Content](https://www.w3.org/TR/WCAG22/#non-text-content)
