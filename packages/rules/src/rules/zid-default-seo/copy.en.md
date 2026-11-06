# Zid store page still has Zid's default title or description

## Messages

### title

The title of this Zid store page ({title}) is the default one Zid writes when no SEO title is set.

### description

The description of this Zid store page ({description}) is the default one Zid writes when no SEO description is set.

## Why it matters

- The title and description are what a shopper reads in the search result. «name | متجر إلكتروني» and «اكتشف منتجات وتشكيلات وأحدث عروض…» say the same on every store and nothing about what you sell.
- A title that names the product or category and says what is special about it is what makes someone choose your result over the next.
- Google may rewrite a weak snippet from the page, but a clear one you wrote is the one it usually keeps.

## How to fix

Write the SEO title and description for the home page, each category and each product:

```html
<title>عطور وبخور عربية | متجر الواحة</title>
<meta name="description" content="عطور عود ومسك وبخور عربية بتركيزات عالية، تُشحن خلال يومين إلى كل مدن المملكة." />
```

- Open the SEO settings of the store (the home page) and of each product and category in your Zid dashboard; the menu names change between releases, so look for “SEO”. Zid’s developer documentation lists the sections that take SEO content.
- Write a title of the product or category name, then the store; a description of one or two sentences about what the shopper gets.
- Do the products that sell most first.

## How we detect

1. A page counts as a Zid store page when Arablyzer’s platform check recognises Zid with 50 or more confidence out of 100 (its cookies, its scripts, its media host).
2. The title is the default when it ends with « | متجر إلكتروني», the form we saw on Zid’s demo store on 2026-11-04. The description is the default when it begins «اكتشف منتجات وتشكيلات وأحدث عروض».
3. The wording is Zid’s and can change, so a page that Zid words differently is not flagged. A title that merely contains the words «متجر إلكتروني» is not flagged.

## References

- [Zid developer documentation: SEO and marketing tags in themes](https://docs.zid.sa/themes-seo-marketing-tags)
- [Google Search Central: control your title links](https://developers.google.com/search/docs/appearance/title-link)
