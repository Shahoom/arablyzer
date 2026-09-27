# Button without an accessible name

## Messages

### missing

This button has no accessible name, so a screen reader announces it as a button without saying what it does.

## Why it matters

- Icon buttons, such as add to cart, add to wishlist, search and close, show only a picture. Without a name, a screen reader announces each one as a button, and people cannot tell which does what.
- WCAG 2.2 asks that every control has a name that assistive technology can read (success criterion 4.1.2, level A).

## How to fix

- Give each icon button a name in the page's language: `<button type="button" aria-label="أضف إلى المفضلة">…</button>`.
- Or put visible text in the button, beside the icon.
- Keep `aria-hidden="true"` on the icon itself, so it is not read twice.

## How we detect

1. We render the page and run axe-core 4.13.0's `button-name` rule in each engine.
2. It reports each `<button>` whose accessible name is empty: no text, and no `aria-label`, `aria-labelledby` or `title`. Buttons written as `<input type="button">` and its kin are a different axe rule, which Arablyzer does not run yet.
3. It does not apply to pages without buttons.

## References

- [W3C: Understanding WCAG 2.2, Name, Role, Value (4.1.2)](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- [axe-core: button-name](https://dequeuniversity.com/rules/axe/4.13/button-name)
