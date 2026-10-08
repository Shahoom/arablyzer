# A PDF with no title or language

## Messages

### no-title

The file {url} has no document title: the browser shows the file name in the tab instead of a title, and a screen reader reads the name.

### no-language

The file {url} has no document language (/Lang): a screen reader does not know the text is Arabic, and speaks it in the voice of another language.

## Why it matters

- **The document title** is what shows in a reader's tab, in search lists and in screen readers, and a file name (such as `final_v3.pdf`) is not a title.
- **The document language** sets a screen reader's voice, the text direction and the spell-checking dictionaries, and is required by the PDF/UA standard.

## How to fix

- Word: File › Options › Save, then «Save as PDF» › «Options» and turn on «Document properties»; write the title in the file's properties (File › Info › Title) and set the text's proofing language to Arabic.
- InDesign: File › File Info › Title; on export turn on «Create Tagged PDF» and set the paragraphs' language.
- Acrobat: File › Properties › Description › Title; and Properties › Advanced › Language «Arabic».

## How we detect

1. We read the PDF we fetched (see the rule «An Arabic PDF that machines cannot read») and take its title from the Title field or from the XMP metadata (dc:title), and its language from /Lang in the catalogue or from XMP (dc:language).
2. /Lang is read from the file's plain text when it is not inside a compressed stream; a file may carry it where we cannot see it, and we say so on the page.
3. It is a minor finding.

## References

- [PDF Association: PDF/UA](https://pdfa.org/resource/iso-14289-pdf-ua/)
- [W3C: PDF techniques for accessibility (PDF16)](https://www.w3.org/TR/WCAG20-TECHS/PDF16.html)
