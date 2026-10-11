---
summary: Does your store link to its privacy, terms, returns and shipping pages, where customers and Google look for them?
---

# Store policy pages checker

Reads a store page and checks that it points at the four policy pages customers and Google Merchant Center look for before a purchase: the privacy policy, the terms and conditions, the return policy and the shipping policy. It reads the links on the page; it does not judge what the pages say.

## What it checks

- That the page is a store's: it links to a cart or checkout, or runs on a store platform such as Salla, Zid, YouCan or Shopify.
- That a link names the privacy policy («سياسة الخصوصية»), the terms and conditions («الشروط والأحكام»), the return policy («سياسة الاسترجاع») and the shipping policy («الشحن والتوصيل»), in Arabic or English.
- That each is found in the HTML as the server sends it, so a footer drawn by a script is reported as missing.

## Example

### Wrong

```html
<a href="/cart">سلة المشتريات</a>
<footer>
  <ul>
    <li><a href="/about">من نحن</a></li>
    <li><a href="/contact">اتصل بنا</a></li>
  </ul>
</footer>
```

### Right

```html
<a href="/cart">سلة المشتريات</a>
<footer>
  <ul>
    <li><a href="/about">من نحن</a></li>
    <li><a href="/privacy">سياسة الخصوصية</a></li>
    <li><a href="/terms">الشروط والأحكام</a></li>
    <li><a href="/returns">سياسة الاسترجاع</a></li>
    <li><a href="/shipping">الشحن والتوصيل</a></li>
  </ul>
</footer>
```

## How to fix

1. Write the four pages. A short, plain page for each is better than a long one nobody reads: what you collect and why, what the customer agrees to, how many days they have to return and who pays, how long delivery takes and what it costs.
2. Add them to the footer menu of the store, so every page links to them, the home page and the product pages included.
3. Name each link with the customer's words: «سياسة الاسترجاع», «الشحن والتوصيل».
4. In Merchant Center, enter the return and shipping policies in the business settings as well; it reads them there.
5. Have a lawyer read the terms and the privacy policy. The e-commerce rules differ in Saudi Arabia, the UAE, Oman and the other Gulf countries, and this tool cannot tell which apply to you.

## FAQ

### Does Google require these pages?

Google Merchant Center asks a store to show its return and shipping information, and to make its business contact details easy to find. A store that does not may see products disapproved. The privacy policy and terms are asked by payment providers and by law in many countries.

### Why does the tool say a link is missing when my footer has it?

If the footer is drawn by JavaScript after the page loads, it is not in the HTML the tool reads. A store builder that renders the footer on the server shows it; one that renders it in the browser does not. Check with "view source" on your page: if the links are not there, a crawler that does not run scripts does not see them either.

### Is a link to a pop-up or a PDF enough?

The tool counts any link whose text or address names the policy. A link to a page is the better practice: it can be read, shared and indexed.

### Does it read the policy pages?

No. It checks that the page points at them. Open each one and read it: a policy page that says nothing is no better than none.

## Methodology

We read the links of the page in its HTML as the server sends it. A page counts as a store's when it links to a cart or checkout, or when its platform fingerprint is a store platform's. A policy is found when a link's text, aria-label or address names it, in Arabic or English; the match is loose, so a policy is reported only when nothing points at one. Nothing but the page is requested. See the rule's page for the details.
