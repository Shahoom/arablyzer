---
summary: Does your page write dates one way: يناير or كانون الثاني, «2026-03-05» or «05/03/2026»?
---

# Arabic date format checker

Give the address of a page and this tool reads the dates on it and tells you whether it names months from two regions («مارس» beside «كانون الأول») or writes numeric dates in two forms («2026-03-05» beside «05/03/2026»).

## What it checks

- Arabic month names of two families on one page: the Gulf and Egypt’s («يناير، فبراير، مارس…») and the Levant and Iraq’s («كانون الثاني، شباط، آذار…»).
- A month name counts only beside a day or a year, so a word that spells like a month is not taken for a date.
- Numeric dates in two forms: the ISO form «2026-03-05» and the day-first form «05/03/2026», with Arabic-Indic digits read as Western.
- Hijri dates, and the order of day and month in a slash date, are not judged.

## Example

### Wrong

```html
<p>نُشر هذا الخبر في 5 مارس 2026 وعُدّل في 12 كانون الأول 2025.</p>
```

### Right

```html
<p>نُشر هذا الخبر في 5 مارس 2026 وعُدّل في 12 ديسمبر 2025.</p>
```

## How to fix

Pick one set of month names for the whole site, one numeric form, and write dates from one function in the template:

```html
<p>نُشر هذا الخبر في <time datetime="2026-03-05">5 مارس 2026</time>.</p>
```

- For readers in the Gulf, Egypt and the Maghreb: «يناير» to «ديسمبر». For the Levant and Iraq: «كانون الثاني» to «كانون الأول».
- Use the ISO form «2026-03-05» for numbers: it reads the same everywhere. The `<time datetime>` element lets programs read the date too.
- Format dates in the theme, not by hand.
- Label a Hijri date with «هـ» and keep it apart from the Gregorian one.

## FAQ

### Which month names should I use?

Those your readers use. If your readers are in the Gulf or Egypt, «يناير» and «فبراير». If they are in Syria, Lebanon, Jordan, Palestine or Iraq, «كانون الثاني» and «شباط». If both, choose one and keep it.

### Is writing «05/03/2026» wrong?

It is not wrong, but a reader cannot tell whether it is the fifth of March or the third of May. The ISO form «2026-03-05» cannot be misread.

### Does it check Hijri dates?

No. It checks Gregorian month names and numeric forms only.

## Methodology

The check reads the page’s visible text (not scripts or code). A month name counts when a day or year of one to four digits stands next to it. A numeric date counts when it is a valid day and month with a four-digit year, as «2026-03-05» or «05/03/2026» (or «05.03.2026»). Arabic-Indic and Persian digits are turned into Western ones first. The page is flagged when both families, or both forms, are present.
