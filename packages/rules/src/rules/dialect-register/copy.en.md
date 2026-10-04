# The page's dialect does not fit the country or the rest of the page

## Messages

### contradicts-gulf

The page's text leans Gulf ({hits} telling words, such as «{example}») and the page is written for {country}, where that dialect is not spoken.

### contradicts-egyptian

The page's text leans Egyptian ({hits} telling words, such as «{example}») and the page is written for {country}, where that dialect is not spoken.

### contradicts-levantine

The page's text leans Levantine ({hits} telling words, such as «{example}») and the page is written for {country}, where that dialect is not spoken.

### contradicts-maghrebi

The page's text leans Maghrebi ({hits} telling words, such as «{example}») and the page is written for {country}, where that dialect is not spoken.

### register-formal-headings

The headings are in Modern Standard and the text under them is colloquial (such as «{example}»): a reader hears the tone change between a heading and what follows.

### register-colloquial-headings

The headings are colloquial (such as «{example}») and the text under them is Modern Standard: a reader hears the tone change between a heading and what follows.

### mixed

The text mixes words of two dialects, such as «{first}» and «{second}», so the reader does not hear one voice for the brand.

## Why it matters

- **Dialect is a brand's identity to a local reader.** A Saudi store that writes «إزاي» and «عايز» sounds Egyptian, and an Egyptian store that writes «وايد» and «شلون» sounds Gulf; the visitor takes that as a sign the text was copied, or written for another market.
- **Colloquial Arabic in commercial writing is a choice of tone, not a mistake**, but a tone that changes between the heading and the text, or two dialects on one page, looks unintended.
- **Search engines and AI assistants** match the language of the question to the language of the page: someone searching in their dialect finds pages written in it first.

## How to fix

- Decide one voice for the brand: plain Modern Standard suits every market, a local dialect suits one.
- If you choose a dialect, choose the one of the country you serve, and use the same words in headings and text.
- Review text copied from another country's site or from a translator, which may carry its dialect's words with it.

## How we detect

1. We read the visible text of an Arabic page (code tags left out) and separate the headings from the rest.
2. We count words from a small, documented list (see the [Arabic features plan](https://github.com/Shahoom/arablyzer/blob/main/docs/design/plans/arabic-native.md)): words only speakers of one dialect write, such as إزاي, عايز and دلوقتي (Egyptian), وايد, شلون and ابغى (Gulf), هلق, شو and بدي (Levantine), بزاف, واش and ديال (Maghrebi). Words two dialects share are left out, and hamza forms and ta marbuta are folded before matching.
3. With fewer than 80 Arabic words we give no verdict. Otherwise a dialect is called when at least 3 of its words are found and they are a fifth of all the telling words (dialect and Modern Standard); otherwise the text is Modern Standard.
4. We compare the dialect with the country the page is written for, named by two different kinds of evidence at least (domain, language, currency, calling code); with no confirmed country we do not compare.
5. The list is a sample, not a dictionary: colloquial text with none of these words reads as Modern Standard. It is not a language-ID model. It is a minor finding.

## References

- [Wikipedia: Varieties of Arabic](https://en.wikipedia.org/wiki/Varieties_of_Arabic)
- [W3C: Arabic and Persian Layout Requirements](https://www.w3.org/TR/alreq/)
