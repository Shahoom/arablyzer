# Store page does not link to its policies

## Messages

### privacy

This store page ({evidence}) has no link to a privacy policy in its HTML.

### terms

This store page ({evidence}) has no link to terms and conditions in its HTML.

### returns

This store page ({evidence}) has no link to a returns or refund policy in its HTML.

### shipping

This store page ({evidence}) has no link to a shipping and delivery policy in its HTML.

## Why it matters

- Customers look for the return and shipping terms before they pay, and a store that hides them loses the sale of the careful ones.
- Google Merchant Center asks a store to show its return and shipping information on its site, and may disapprove products of a store that does not.
- The privacy policy and the terms are what a customer's data and a dispute are judged by; payment providers and app stores ask for them, and so do the laws on e-commerce in the Gulf countries, which differ from one country to another: ask your adviser which apply to your store.
- Stores built on a platform have the pages by default but often not the links: the theme's footer was customised and lost them.

## How to fix

Create the four pages if they do not exist, and link to them from the footer of every page:

```html
<footer>
  <ul>
    <li><a href="/privacy">سياسة الخصوصية</a></li>
    <li><a href="/terms">الشروط والأحكام</a></li>
    <li><a href="/returns">سياسة الاسترجاع</a></li>
    <li><a href="/shipping">الشحن والتوصيل</a></li>
  </ul>
</footer>
```

- On Salla and Zid, the pages are created in the store's pages settings and added to the footer menu; on Shopify, from Settings, Policies, and the footer menu in the theme.
- Name each page and its link in the words customers use: «سياسة الاسترجاع»، «الشحن والتوصيل».
- Put the same links in the footer of every page, the home page and the product pages included.

## How we detect

1. A page counts as a store's when its HTML links to a cart or checkout (an address with `/cart`, `/checkout` or `/basket`, or the words «سلة المشتريات» or «عربة التسوق»), or it runs on a store platform we recognise (Salla, Zid, YouCan, ExpandCart, Shopify, WooCommerce, Magento, PrestaShop, OpenCart, BigCommerce, Ecwid).
2. For each policy we look for a link whose text, aria-label or address words name it, in Arabic or English: privacy («خصوصية»), terms («الشروط»، «الأحكام»), returns («استرجاع»، «إرجاع»، «استبدال»، refund), shipping («شحن»، «توصيل»). The match is loose on purpose: it reports a policy only when no link on the page points at one.
3. A page with no links in its HTML (its menu is drawn by a script) is not judged.

The check reads the links on the page you scan, not the pages behind them: it does not tell you if a policy page is good, only that the page points at one.

## References

- [Google Merchant Center Help](https://support.google.com/merchants/)
