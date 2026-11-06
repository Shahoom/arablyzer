# Page writes dates in two forms

## Messages

### month-names

The page names months from two regions: «{levant}» and «{gulf}».

### numeric

The page writes numeric dates in two forms: «{iso}» and «{slash}».

## Why it matters

- Arabic has two sets of month names. In Iraq, Syria, Lebanon, Jordan and Palestine the months are the Syriac ones («كانون الثاني، شباط، آذار»); in Egypt, the Gulf and most of the Arab world they are «يناير، فبراير، مارس». Each set is plain to its readers and foreign to the others.
- A page that uses both reads as stitched together from two sources, and shows the reader a set that is not theirs.
- Dates written «2026-03-05» on one line and «05/03/2026» on the next make a reader stop and ask which is the day and which the month, and a program reading them can get one of them wrong.

## How to fix

Pick one set of month names for the whole site, matching the readers you write for, and one numeric form:

```html
<p>نُشر هذا الخبر في 5 مارس 2026 وعُدّل في 12 ديسمبر 2025.</p>
```

- For readers in the Gulf, Egypt and the Maghreb: «يناير» to «ديسمبر». For the Levant and Iraq: «كانون الثاني» to «كانون الأول».
- Write numeric dates in one order. The ISO form «2026-03-05» is read the same everywhere; the `<time datetime="2026-03-05">` element lets programs read it too.
- Format dates in the theme or template, not by hand, so each one comes from the same function.
- If you show the Hijri date beside the Gregorian, label it with «هـ» and keep it apart.

## How we detect

1. We read the visible text of the page, not code.
2. A month name counts only beside a day or a year («5 مارس»، «آذار 2026»), so a word that spells like a month («مارس» as a verb) is not taken for a date.
3. The `month-names` message: the page has a date in one family of names and a date in the other. The `numeric` message: it has a date as «2026-03-05» and a date as «05/03/2026» (Arabic-Indic digits are read as Western).
4. Hijri dates and the order of day and month in a slash date are not judged: we cannot tell 05/03 from 03/05.

## References

- [Unicode CLDR: Arabic month names by locale](https://cldr.unicode.org/)
- [W3C: Date and time formats on the web](https://www.w3.org/International/questions/qa-date-format)
