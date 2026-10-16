---
summary: Will Google Merchant Center accept your feed: fields, prices, stock and GTIN?
---

# Google Merchant feed checker

Give the address of your product feed (an RSS, Atom or tab-separated file) and this tool reads its products and checks them against Google Merchant Center's product data specification: the required fields, the form of prices and availability, GTIN check digits, and the quality of Arabic titles and descriptions. It requests the feed file only.

## What it checks

- The seven attributes every product needs: `id`, `title`, `description`, `link`, `image_link`, `price` and `availability`, and ids used by more than one product.
- Availability and condition from Google's lists, so «متوفر» is caught, and prices written as a number, a space and an ISO currency code: `120.00 SAR`, not `١٢٠ ر.س` or `120,50`.
- A sale price below the price, links that are full http or https addresses, and GTINs with the right length and check digit.
- Titles over 150 characters, titles in capitals or with promotional wording, descriptions that repeat the title, Arabic stretched with tatweel and Arabic garbled by a wrong encoding.

## Example

### Wrong

```xml
<item>
  <g:id>OUD-1</g:id>
  <title>عطر العود الملكي 50 مل</title>
  <description>عطر من خشب العود الطبيعي بتركيز عالٍ.</description>
  <link>/p/oud-1</link>
  <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
  <g:price>١٢٠ ر.س</g:price>
  <g:availability>متوفر</g:availability>
  <g:gtin>4006381333932</g:gtin>
</item>
```

### Right

```xml
<item>
  <g:id>OUD-1</g:id>
  <title>عطر العود الملكي 50 مل</title>
  <description>عطر من خشب العود الطبيعي بتركيز عالٍ ويدوم طويلاً.</description>
  <link>https://shop.example/p/oud-1</link>
  <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
  <g:price>120.00 SAR</g:price>
  <g:availability>in_stock</g:availability>
  <g:condition>new</g:condition>
  <g:gtin>4006381333931</g:gtin>
  <g:brand>الواحة</g:brand>
</item>
```

## How to fix

Fix the value where the feed is made, not in the file: the platform's Google Shopping export or the feed plugin maps the store's fields to Google's attributes, and that mapping is where an Arabic availability or a currency symbol gets in.

- Availability: map the store's statuses to `in_stock`, `out_of_stock`, `preorder` or `backorder`.
- Price: export the number with a full stop, a space and the currency code (`SAR`, `AED`, `OMR`, `KWD`, `BHD`, `QAR`, `EGP`), and keep three decimals for OMR, KWD and BHD.
- Link and image: full addresses starting with `https://`.
- GTIN: copy it from the packaging or the supplier; if the product has none, omit it and set `identifier_exists` to `no`.
- Titles: product name, brand and what tells it apart, in the order shoppers say them; no offers or capitals.

After fixing, fetch the feed again in Merchant Center and check its diagnostics there too: this tool checks the feed's text, Merchant Center also checks your website.

For example:

```xml
<g:price>120.00 SAR</g:price>
<g:availability>in_stock</g:availability>
```

## FAQ

### Does it work with Salla, Zid and Shopify feeds?

It works with any feed in Google's formats, whichever platform makes it. Give the address of the feed file, not of the store. Each platform names the export differently; look for Google Shopping or Merchant Center in its marketing or channels settings.

### Why does it check only the first 5,000 products?

A feed can be very large and the check reads it in one request, so it stops at 5,000 products and says so in a notice. Problems are usually the same in every product, so the first 5,000 show them; a very large feed with a rare fault may need Merchant Center's own diagnostics as well.

### Does it replace Merchant Center's diagnostics?

No. It checks the feed file against the published specification, before you upload. Merchant Center also checks your website, your shipping and tax settings and your policies, and applies rules per country, which this tool does not.

### Why does it not open my product links?

Because it would be hundreds of requests to your store. It requests the feed file only, once.

## Methodology

We fetch the address as we do any page, and read the response as an RSS 2.0 feed, an Atom 1.0 feed or a tab-separated text file, with attribute names folded (`g:image_link`, `image link` and `image_link` are one). The checks are the product data specification's: the required attributes, the lists of values, the price format, GS1's check digit and the limits of 150 and 5,000 characters. The list of promotional words is ours and short. See each rule's page for the details.
