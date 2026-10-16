---
summary: Paste Arabic text or give a page: the hamza, ta marbuta and tanween slips we are sure of.
---

# Arabic spell checker

Reads Arabic text you paste, or a page you give us the address of, and names the common spelling slips it is sure of: a hamza left off in «الاسعار», ha for ta marbuta in «المدينه», ya for alef maqsura in «مستشفي», a tanween in the wrong place, «انشاء الله» for «إن شاء الله», and some typing slips. Each comes with its fix and how sure the check is.

## What it checks

- A dropped hamza on an alef, waw or ya, as in «الاسعار», «اسهل» and «مسوؤل», where the hamza is what the word lacks.
- Ha where a definite noun ends in ta marbuta, as in «المدينه» and «الخدمه», and in «ميزه جديدة» when what follows shows that the noun is feminine.
- Ya and alef maqsura mixed up in «مستشفي», «فى» and «الذى».
- Tanween: «مرةاً» and «كثيرً»; «شكراً» and «شكرًا» are both right, so we do not report them.
- The phrase «إن شاء الله» and what is written for it by mistake. We leave out names, brands and foreign words, dialect words, verbs that may be a command with no hamza («احصل», «اطلب»), what is inside « » or quotation marks, links and words glued to Latin letters.
- We name only what we are sure of (90% confidence or more): precision comes before how many we find, and you can ask us to add likely slips (70% or more), which we mark as likely.

## Example

### Wrong

```html
<p>نلتزم بجودة المنتجات والخدمه، ونرحب بكم في فرعنا بالمدينه المنورة كل يوم.</p>
```

### Right

```html
<p>نلتزم بجودة المنتجات والخدمة، ونرحب بكم في فرعنا بالمدينة المنورة كل يوم.</p>
```

## How to fix

- Change the word as the check suggests, and have pages that several people write read once more.
- Turn on an Arabic spell checker in your content editor or browser.
- If a word it names is a brand name on purpose, give your brand's name in JSON-LD and in `og:site_name` and the check skips it.

```html
<meta property="og:site_name" content="متجر الواحة" />
```

## FAQ

### Does it replace a proofreader?

No. It names the slips it is sure of, which are the common spelling slips; it does not judge grammar, style, names, foreign words or dialects.

### What does the percentage beside each slip mean?

The service's own estimate that the word is a slip and the suggestion is its fix. We report 90% and over, and likely slips between 70% and 90% if you ask for them.

### Where does the text I paste go?

To our own Arabic language service, where it stays in memory for the few seconds the answer takes and is then deleted. We do not store or log it.

### Why does it not find a slip in «ميزه» or «مناسبه»?

Because the word may be «ميزة» and may be «ميز» with the pronoun «his» (ه), and only the sentence around it says which; where the sentence does not say, we do not report it.

## Methodology

We read the text (or the page's visible text) and send it to the Arabic language service, which asks CAMeL Lab's Arabic morphology databases (CALIMA MSA, and CALIMA Gulf to tell Gulf words) whether the word, as written, has an analysis. If it has only analyses in another spelling, and that spelling is clearly the likelier, the word is a slip with its fix, and the service estimates its confidence. The measured precision and the limits of the check are in the [deep Arabic plan](https://github.com/Shahoom/arablyzer/blob/main/docs/design/plans/m7-deep-arabic.md), and the rule's details on its page.
