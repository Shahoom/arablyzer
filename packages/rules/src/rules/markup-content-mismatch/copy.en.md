# Structured data says what the page does not

## Messages

### price

The product «{name}» is priced {price} in its markup, and the page shows no such price.

### rating

The product's rating in its markup (value {value}, count {count}) is nowhere on the page.

### breadcrumb

{count} names of the breadcrumb markup are not on the page, such as «{name}».

### telephone

The telephone {telephone} in the markup is not on the page.

## Why it matters

- Google asks that structured data describe what a visitor can see on the page. A price that only the markup holds, a rating nobody can read, a trail the page does not draw, or a number a visitor cannot call is markup for content that is not there, and can cost the page its rich results or bring a manual action.
- The price is the commonest slip on Gulf stores: the page shows «١٢٠ ر.س» or a price drawn by a script, and the markup says something else, because the markup comes from the store's data and the page from its theme.
- The markup and the page are two copies of one fact. When they differ, shoppers and crawlers read two prices.

## How to fix

Make the page show what the markup says, or the markup say what the page shows:

```html
<p>السعر: ١٢٠ ر.س</p>
<p>التقييم: ٤٫٥ من ٥ (١٢٨ تقييماً)</p>
```

- Write the price in the page's HTML (not only in a script), and generate the markup from the same value.
- Show the rating the markup gives, with its count, or remove the rating from the markup.
- Show the breadcrumb trail with the names the markup gives.
- Show the telephone number as text, or as a `tel:` link with the number as its text.
- Digits in either script are fine: «١٢٠» and 120 are the same price here.

## How we detect

1. We read the page's visible text and every number in it, in either script of digits. Each number is read with its separators dropped and with its last separator as the decimal mark, so «12,500» meets both 12500 and 12.5.
2. `price`: the product the page describes of itself (the top of a JSON-LD block) has an offer price, or a lowest price, above zero, and no number of the page equals it to the third decimal.
3. `rating`: its `aggregateRating` gives a value or a count, and neither number is on the page.
4. `breadcrumb`: the names of a `BreadcrumbList` that the page's text does not hold, compared by their letters alone.
5. `telephone`: an object's `telephone` whose last eight digits are not among the digits of the page's text, whatever the spaces and the script.
6. One finding for each message.

## References

- [Google Search Central: structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google Search Central: product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
