# WCAG

WCAG, the Web Content Accessibility Guidelines, is the W3C standard for making web content accessible to people with disabilities, in testable criteria at three levels.

## Definition

- WCAG comes from the W3C's Web Accessibility Initiative. Its latest version, 2.2, published in October 2023, added nine success criteria to 2.1 and removed 4.1.1 Parsing; it is also the standard ISO/IEC 40500:2025.
- Its guidelines sit under four principles, perceivable, operable, understandable and robust, with testable success criteria at levels A, AA and AAA; conforming at AA means meeting every A and AA criterion.
- Content that conforms to WCAG 2.2 also conforms to 2.1 and 2.0, and the W3C lists an authorized Arabic translation of 2.1, «مبادئ النفاذ إلى محتوى الويب».

## Why it matters

- Its criteria are concrete checks, such as contrast of at least 4.5:1 (1.4.3, AA) and a name for every button and link (4.1.2, A).
- Some meet Arabic directly: the page's language (3.1.1, A) lets screen readers read it with Arabic pronunciation, and marking English passages (3.1.2, AA) lets them switch voice.
- It makes content usable by more people with disabilities, including blindness, deafness, limited movement and photosensitivity.

## Example

Four common checks and their success criteria:

| Check | Success criterion | Level |
|---|---|---|
| Informative images have an `alt` | 1.1.1 Non-text Content | A |
| Text contrast of at least 4.5:1 | 1.4.3 Contrast (Minimum) | AA |
| `lang` on `<html>` | 3.1.1 Language of Page | A |
| Buttons and links have a name | 4.1.2 Name, Role, Value | A |

## Common mistakes

- Aiming at level A only: AA adds criteria such as contrast (1.4.3) and the language of parts (3.1.2).
- Testing only the English version: Arabic pages have their own text, language, direction and fonts.
- Trusting tools that skip Arabic text: axe-core can take Arabic sentences for icon-font ligatures and leave them out of its contrast check.

## References

- [W3C WAI: WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [W3C: Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C WAI: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C: the authorized Arabic translation of WCAG 2.1](https://www.w3.org/Translations/WCAG21-ar/)
