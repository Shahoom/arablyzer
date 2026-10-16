# Common spelling slips in the page's text

## Messages

### hamza

«{word}» is missing its hamza or has it in the wrong place; it is written «{suggestion}» (our confidence {confidence}%).

### ta-marbuta

«{word}» ends in ha (ه) where Arabic writes ta marbuta (ة): «{suggestion}» (our confidence {confidence}%).

### alef-maqsura

«{word}» mixes up alef maqsura (ى) and ya (ي); it is written «{suggestion}» (our confidence {confidence}%).

### tanween

«{word}» has its fathatan in the wrong place; it is written «{suggestion}» (our confidence {confidence}%).

### typo

«{word}» looks like a typing slip; the nearest word is «{suggestion}» (our confidence {confidence}%).

### phrase

«{word}» is written «{suggestion}» (our confidence {confidence}%).

## Why it matters

- **Spelling slips cost trust.** A reader who meets «الاسعار» with no hamza or «المدينه» with a ha takes the page for hurried work, and that weighs most in shops and checkout pages.
- **Search engines and AI assistants match letters.** A page written «الاسعار» may not appear at the top for a search for «الأسعار», and an assistant quotes the slip as it is.
- **The slips Arabic writers make are few and cheap to fix**: the hamza, ta marbuta and ha, alef maqsura and ya, the tanween, and some typing slips.

## How to fix

- Change the word as the finding suggests: «الاسعار» to «الأسعار», «المدينه» to «المدينة», «مستشفي» to «مستشفى».
- Turn on an Arabic spell checker in your content editor or browser, and have pages that several people write read once more.
- Hold text copied from chat apps or translators for review before it is published.
- If a word is a brand or product name on purpose, give it as the brand's name (JSON-LD or og:site_name) and the check skips it.

## How we detect

1. We read the visible text of an Arabic page (code tags, quotations in « » and quotation marks, links, mail addresses and words glued to Latin letters or digits are left out).
2. The Arabic NLP service asks CAMeL Lab's morphology databases (CALIMA MSA and CALIMA Gulf) whether the word, as written, has an analysis. If it has only analyses in another spelling (a dropped hamza, ha for ta marbuta, ya for alef maqsura), the correct spelling is clearly the likelier, and the word is one the database has counted, it is a slip, with its fix.
3. We leave out names, brands and foreign words, dialect words (a short list written by hand), verbs that may be a command with no hamza («احصل», «اطلب»), every vowelled word, every word stretched with three or more of a letter, and the site's own brand names.
4. The service estimates its confidence for each word and we report words at 90% or more (the operator can change it). The aim is high precision at the cost of how many slips are found: what we are unsure of we do not report, such as «مناسبه», which may be «مناسب» with the pronoun «his».
5. Each word is reported once with how often it appears, at most twenty words. The severity is moderate.
6. Where the service is not running the check is not made and the report carries a notice; the scan does not fail because of it. The measured precision and its limits are in the [deep Arabic plan](https://github.com/Shahoom/arablyzer/blob/main/docs/design/plans/m7-deep-arabic.md).

## References

- [Wikipedia: Hamza](https://en.wikipedia.org/wiki/Hamza)
- [CAMeL Tools (CAMeL Lab, NYU Abu Dhabi)](https://github.com/CAMeL-Lab/camel_tools)
