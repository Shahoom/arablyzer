# Bidirectional text (bidi)

Bidirectional (bidi) text mixes right-to-left and left-to-right writing, such as English names or numbers in Arabic text; browsers order it with the Unicode bidi algorithm.

## Definition

- A line is bidirectional when both directions share it, as with a brand or a phone number in an Arabic sentence.
- Text is stored in reading order, and browsers lay it out with the Unicode Bidirectional Algorithm (UAX #9): Arabic letters are strongly right to left, Latin letters strongly left to right, digits weak, and spaces and punctuation neutral, taking the direction around them. The paragraph's base direction orders the runs.
- Where the algorithm cannot guess the intent, markup tells it: `dir` where the direction is known, `<bdi>` to isolate text where it is not.

## Why it matters

- Neutral characters between an Arabic run and a Latin one take the paragraph's direction, so in an Arabic sentence `C++` shows as `++C`.
- A phone number such as `+966 50 123 4567` can show as `4567 123 50 966+`: each group stays left to right, but the groups follow the paragraph, so a visitor may dial a wrong number.
- A name from a database can pull the next number into its run: in an Arabic list item written `Sara Ali: 3 طلبات`, the `3` shows beside the name, away from the word it counts.

## Example

`dir="ltr"` for what is always left to right, `<bdi>` for text of unknown direction:

```html
<!-- Always left to right -->
<p>واتساب: <span dir="ltr">+966 50 123 4567</span></p>

<!-- A name of either direction -->
<li><bdi>Sara Ali</bdi>: 3 طلبات</li>
```

## Common mistakes

- Checking a phone number on its own in the editor: it breaks only inside an Arabic sentence.
- Using `<bdo>`: it overrides the algorithm for all it contains, and the W3C keeps it for special cases.
- Invisible marks such as `U+200F` where markup would do: the W3C keeps control characters for places markup cannot reach, such as a `title` attribute.

## References

- [Unicode: UAX #9, the Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/)
- [W3C: Unicode Bidirectional Algorithm basics](https://www.w3.org/International/articles/inline-bidi-markup/uba-basics)
- [W3C: Inline markup and bidirectional text in HTML](https://www.w3.org/International/articles/inline-bidi-markup/)
- [HTML Standard: the bdi element](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-bdi-element)
