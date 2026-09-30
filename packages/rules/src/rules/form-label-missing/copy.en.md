# Form field without a label

## Messages

### missing

This form field has no label, so a screen reader announces it without saying what to type in it.

## Why it matters

- A label tells everyone what a field is for, and screen readers read it when the field gets focus. Text placed near a field without being tied to it, such as a paragraph above it, is not read with it.
- Clicking a label also moves to its field, a larger target on a phone.
- WCAG 2.2 asks that every control has a name that assistive technology can read (success criterion 4.1.2, level A).

## How to fix

- Tie a `<label>` to the field: `<label for="email">البريد الإلكتروني</label> <input id="email" type="email">`, or put the field inside its label.
- For a field without visible text, such as a search box, give it `aria-label="ابحث في المتجر"`.

## How we detect

1. We render the page and run axe-core 4.13.0's `label` rule in each engine.
2. It reports each input and textarea without an accessible name: no label, `aria-label`, `aria-labelledby`, `title` or placeholder. axe accepts a placeholder as a name; it disappears as someone types, so a visible label is still better. Lists (`<select>`) are a different axe rule, which Arablyzer does not run yet.
3. It does not apply to pages without form fields.

## References

- [W3C: Understanding WCAG 2.2, Name, Role, Value (4.1.2)](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- [W3C WAI: Labeling controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- [axe-core: label](https://dequeuniversity.com/rules/axe/4.13/label)
