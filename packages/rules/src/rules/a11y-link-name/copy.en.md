# Link without an accessible name

## Messages

### missing

This link has no accessible name, so a screen reader announces it as a link without saying where it leads.

## Why it matters

- A screen reader reads a link by its name: its text, the `alt` of its image, or its `aria-label`. An icon link without one is announced as a link and nothing more, and people cannot tell the cart from the account page.
- People who move through a page by its list of links see an empty entry.
- WCAG 2.2 asks that the purpose of each link can be told (success criterion 2.4.4, level A) and that every control has a name (4.1.2, level A).

## How to fix

- Give icon links a name in the page's language: `<a href="/cart" aria-label="السلة">…</a>`, or visible text beside the icon.
- For a linked image, write its `alt`: `<a href="/"><img src="logo.svg" alt="متجر الواحة"></a>`.
- Keep `aria-hidden="true"` on decorative icons inside links that already have text.

## How we detect

1. We render the page and run axe-core 4.13.0's `link-name` rule in each engine.
2. It reports each link whose accessible name is empty: no text, no image `alt`, and no `aria-label`, `aria-labelledby` or `title`.
3. It does not apply to pages without links.

## References

- [W3C: Understanding WCAG 2.2, Link Purpose (In Context) (2.4.4)](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
- [W3C: Understanding WCAG 2.2, Name, Role, Value (4.1.2)](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- [axe-core: link-name](https://dequeuniversity.com/rules/axe/4.13/link-name)
