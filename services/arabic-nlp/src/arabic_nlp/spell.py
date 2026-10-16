"""Spelling: the classic Arabic slips, flagged only where the evidence is strong.

Precision comes first. A word is flagged when the Modern Standard database knows it only as a
variant of another spelling (the hamza left off, ة written ه, ى written ي), the written form is
no word of its own, and the correct spelling is clearly the likelier one. Names, brands, Gulf
speech, words the database has never counted, quotations and anything that is not plain prose are
left alone. Each finding carries a confidence from a documented formula (docs/design/plans/
m7-deep-arabic.md, "Accuracy policy"); `min_confidence` decides which are reported.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from .comparatives import standard as comparative
from .dialect_words import DIALECT_WORDS
from .lexicon import Lexicon, Reading, WordInfo, fold
from .text import (
    TANWEEN,
    TATWEEL,
    Token,
    context,
    has_long_repeat,
    strip_marks,
    tokens,
)

HAMZA_ALEF = frozenset('اأإآ')
#: What may stand before the stem of a word: the conjunctions, the prepositions and the article.
PREFIX = re.compile('(?:[وفبكل]|ال|س)*')
#: A hamza in the middle of a word is only taken for a slip when the word is common.
MEDIAL_MIN_LOGPROB = -4.5
FAMILIES = ('hamza', 'ta-marbuta', 'alef-maqsura', 'tanween', 'typo', 'phrase')

#: What a slip costs the finding before anything else is weighed: the families that need no guess.
BASE = {'hamza': 0.97, 'ta-marbuta': 0.97, 'alef-maqsura': 0.95}
#: The likelihood a second spelling must stay under, against the best, for the best to stand alone.
DOMINANT_BELOW = 0.5
#: Words never judged: their forms vary by region or by style, and a flag would be an opinion.
EXEMPT = frozenset(
    'الله لله والله بالله تالله إنترنت انترنت'.split()
)


@dataclass(frozen=True)
class Finding:
    text_index: int
    start: int
    end: int
    word: str
    suggestion: str
    family: str
    confidence: float
    before: str
    after: str
    alternatives: tuple[str, ...] = ()


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    words: int = 0
    judged: int = 0
    truncated: bool = False


def family_of(a: str, b: str) -> str | None:
    """The family of the letter `a` written for the letter `b` (b is the right one), or None.

    Only the slips that people make: a hamza left off (ا for أ, إ, آ; و for ؤ; ي or ى for ئ), ه for ة,
    and ي for ى or ى for ي. A hamza that was written is not changed to another, and ة is never
    turned into ه: a writer who put them there meant them, and the database may only lack the word.
    """
    if a == b:
        return None
    if a == 'ا' and b in 'أإآ':
        return 'hamza'
    if (a, b) in {('و', 'ؤ'), ('ي', 'ئ'), ('ى', 'ئ')}:
        return 'hamza'
    if (a, b) == ('ه', 'ة'):
        return 'ta-marbuta'
    if {a, b} == {'ي', 'ى'}:
        return 'alef-maqsura'
    return None


def families_between(word: str, spelling: str) -> list[str] | None:
    """The families that turn `word` into `spelling`, or None if they differ in anything else."""
    if len(word) != len(spelling):
        return None
    found: list[str] = []
    for a, b in zip(word, spelling, strict=True):
        if a == b:
            continue
        family = family_of(a, b)
        if family is None:
            return None
        found.append(family)
    return found or None


def _same_but_for_ending_letters(a: str, b: str) -> bool:
    """Equal but for ي and ى, or ه and ة: two spellings of one word, not two words."""
    return len(a) == len(b) and all(x == y or {x, y} in ({'ي', 'ى'}, {'ه', 'ة'}) for x, y in zip(a, b, strict=True))


def _canonical(top: Reading, near: list) -> Reading:
    """The spelling the lexicon gives the lemma itself, when the likeliest reading is a variant of it:
    «إلى», not «إلي», for the word «الي»."""
    for _, reading, _ in near:
        if (
            reading.spelling == reading.lemma
            and reading.spelling != top.spelling
            and _same_but_for_ending_letters(reading.spelling, top.spelling)
            and fold(reading.lemma) == fold(top.lemma)
            and reading.score >= 0.8 * top.score
        ):
            return reading
    return top


def _edits(word: str, spelling: str) -> dict[int, str]:
    return {i: b for i, (a, b) in enumerate(zip(word, spelling, strict=False)) if a != b}


def _primary(found: list[str]) -> str:
    for family in ('hamza', 'ta-marbuta', 'alef-maqsura'):
        if family in found:
            return family
    return found[0]


def _dominance(ratio: float) -> float:
    """1 when the best spelling stands alone; down to about 0.45 when another is as likely."""
    if ratio <= DOMINANT_BELOW:
        return 1.0
    return max(0.0, 1.0 - 1.1 * (ratio - DOMINANT_BELOW))


def judge_variant(word: str, info: WordInfo) -> tuple[str, str, float, tuple[str, ...]] | None:
    """For a word that no database spelling equals, its fix: (suggestion, family, confidence, others)."""
    if not info.readings or word in info.spellings:
        return None
    near = []
    for reading in info.readings:
        found = families_between(word, reading.spelling)
        if found is not None and reading.attested:
            near.append((reading.score * (0.9 ** len(found)), reading, found))
    if not near:
        return None
    near.sort(key=lambda item: (-item[0], item[1].spelling))
    top_score, top, found = near[0]
    # A name, a foreign word or an abbreviation is spelled as its owner spells it.
    if top.pos in ('noun_prop', 'foreign', 'abbrev'):
        return None
    # «احصل» is a command with no hamza, and right: a first-person verb read without it is not a slip.
    if (
        top.pos == 'verb'
        and top.command_logprob is not None
        and top.verb_logprob is not None
        and top.command_logprob >= top.verb_logprob - 1.0
        # A word that is as likely a noun is the comparative «أفضل», and its hamza was left off.
        and not (top.other_logprob is not None and top.other_logprob >= top.verb_logprob - 1.5)
    ):
        for i, (a, b) in enumerate(zip(word, top.spelling, strict=False)):
            if a == 'ا' and b == 'أ' and PREFIX.fullmatch(word[:i]):
                return None
    # The likeliest reading of the word as a whole must be a spelling of this kind: a word whose
    # likeliest reading is some other word altogether is not a slip.
    if top.score < 0.5:
        return None
    top_edits = _edits(word, top.spelling)
    # A rival that makes the same change and more is no other suggestion: «إلي» is «إلى» and a second change.
    top = _canonical(top, near)
    found = families_between(word, top.spelling) or found
    top_score = next(score for score, reading, _ in near if reading is top)
    rivals = [
        (score, reading)
        for score, reading, _ in near[1:]
        if reading.spelling != top.spelling and not top_edits.items() <= _edits(word, reading.spelling).items()
    ]
    ratio = rivals[0][0] / top_score if rivals else 0.0
    confidence = BASE[_primary(found)] * _dominance(ratio)
    medial = any(
        PREFIX.fullmatch(word[:i]) is None for i in _edits(word, top.spelling) if family_of(word[i], top.spelling[i]) == 'hamza'
    )
    if medial and top.logprob < MEDIAL_MIN_LOGPROB:
        return None
    if len(found) > 2:
        confidence *= 0.9
    others = tuple(reading.spelling for _, reading in rivals[:2])
    return top.spelling, _primary(found), round(confidence, 3), others


#: Slips in a phrase everyone writes the same way: (written, suggestion, confidence).
PHRASES = {
    ('انشاء', 'الله'): ('إن شاء الله', 0.96),
    ('ان', 'شاء', 'الله'): ('إن شاء الله', 0.95),
    ('إنشاء', 'الله'): ('إن شاء الله', 0.86),
    ('انشاءالله',): ('إن شاء الله', 0.96),
    ('ماشاءالله',): ('ما شاء الله', 0.95),
}


def _phrase_findings(index: int, text: str, seq: list[Token]) -> list[Finding]:
    found: list[Finding] = []
    for position in range(len(seq)):
        for size in (3, 2, 1):
            chunk = seq[position : position + size]
            if len(chunk) < size:
                continue
            # The words must be separated by one space, so that «إنشاء الله» across a line is not joined.
            if any(text[a.end : b.start] != ' ' for a, b in zip(chunk, chunk[1:], strict=False)):
                continue
            key = tuple(token.word for token in chunk)
            if key not in PHRASES:
                continue
            suggestion, confidence = PHRASES[key]
            start, end = chunk[0].start, chunk[-1].end
            before, after = context(text, start, end)
            found.append(
                Finding(index, start, end, ' '.join(key), suggestion, 'phrase', confidence, before, after)
            )
            break
    return found


def judge_feminine(word: str, info: WordInfo, following: Token | None, text: str, lexicon: Lexicon) -> tuple[str, float] | None:
    """«ميزه جديدة»: a noun with ه for ة, which also reads as the noun and «his», is told by its neighbour.

    A noun with the pronoun «his» takes a definite adjective («ميزته الجديدة»); an adjective with no «ال» and a
    feminine ة after it can only belong to a feminine noun, so the ه was meant as ة.
    """
    if following is None or not word.endswith('ه') or len(word) < 4:
        return None
    if text[following.start - 1 : following.start] != ' ' or text[following.start - 2 : following.start - 1] != word[-1]:
        return None
    nxt = following.word
    if not nxt.endswith('ة') or nxt.startswith('ال') or len(nxt) < 4 or strip_marks(nxt) != nxt:
        return None
    spelling = word[:-1] + 'ة'
    mine = max((r for r in info.readings if r.spelling == spelling), key=lambda r: r.score, default=None)
    if mine is None or not mine.attested or mine.pos not in ('noun', 'adj') or mine.logprob < -6.0:
        return None
    other = lexicon.lookup(nxt)
    adjective = max((r for r in other.readings if r.spelling == nxt), key=lambda r: r.score, default=None)
    if adjective is None or not adjective.attested or adjective.pos != 'adj':
        return None
    return spelling, 0.92


def judge_tanween(word: str) -> tuple[str, float] | None:
    """The tanween slips that are plain: ةً written with an alef, and ً with no alef on a letter that needs one.

    Both «شكراً» and «شكرًا» are right, and so is «مرةً»; «مرةاً» is not, and neither is «كثيرً».
    """
    if word.count('\u064b') != 1 or any(letter in word for letter in '\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0670'):
        return None
    bare = word.replace('\u064b', '')
    if len(bare) < 3:
        return None
    if word.endswith(('ةاً', 'ةًا')):
        return bare[:-1] + '\u064b', 0.96
    if word.endswith('\u064b') and bare[-1] not in 'اةءى':
        return bare + 'اً', 0.93
    return None


#: How far a kind of slip can be trusted: a doubled letter is a keyboard slip; a hamza seat is a spelling
#: doubt; two letters swapped makes a word by chance too often to flag above the default threshold.
TYPO_CAP = {'double': 0.92, 'seat': 0.88, 'swap': 0.78}
SEATS = 'اأإآءئؤويى'


def _typo_candidates(word: str) -> dict[str, str]:
    """Spellings one small slip away, with the kind of slip: a doubled letter, a hamza seat, a swap."""
    out: dict[str, str] = {}
    for i in range(len(word) - 1):
        if word[i] == word[i + 1]:
            out[word[:i] + word[i + 1 :]] = 'double'
        swapped = word[:i] + word[i + 1] + word[i] + word[i + 2 :]
        if swapped != word:
            out.setdefault(swapped, 'swap')
    for i, letter in enumerate(word):
        for seat in SEATS:
            if seat != letter and family_of(letter, seat) == 'hamza':
                out.setdefault(word[:i] + seat + word[i + 1 :], 'seat')
    return {c: kind for c, kind in out.items() if len(c) >= 3}


def judge_typo(word: str, lexicon: Lexicon) -> tuple[str, float] | None:
    """For a word the databases do not know: the one small slip that makes it a word, if only one does."""
    if len(word) < 5:
        return None
    options: list[tuple[float, str, str]] = []
    for candidate, kind in _typo_candidates(word).items():
        info = lexicon.lookup(candidate)
        if candidate in info.spellings:
            reading = max((r for r in info.readings if r.spelling == candidate), key=lambda r: r.score)
            if reading.attested and reading.pos not in ('noun_prop', 'foreign', 'abbrev'):
                options.append((reading.score, candidate, kind))
    if not options:
        return None
    options.sort(reverse=True)
    if len(options) > 1 and options[1][0] > options[0][0] * DOMINANT_BELOW:
        return None
    score, candidate, kind = options[0]
    confidence = 0.8 + (0.06 if len(word) >= 6 else 0.0) + (0.04 if score >= 0.9 else 0.0)
    return candidate, round(min(confidence, TYPO_CAP[kind]), 3)


def check_texts(
    texts: list[str],
    lexicon: Lexicon,
    *,
    min_confidence: float,
    max_findings: int,
    deadline: float,
) -> Report:
    """Every finding of the texts at or above `min_confidence`, the likeliest first."""
    report = Report()
    seen: dict[str, int] = {}
    for index, text in enumerate(texts):
        sequence = list(tokens(text))
        phrases = _phrase_findings(index, text, sequence)
        report.findings.extend(f for f in phrases if f.confidence >= min_confidence)
        for position, token in enumerate(sequence):
            report.words += 1
            # A word inside a phrase that is judged as a whole is not judged again by itself.
            if any(f.start <= token.start and token.end <= f.end for f in phrases):
                continue
            if time.monotonic() > deadline:
                report.truncated = True
                break
            word = token.word
            if TATWEEL in word or len(word) < 2 or has_long_repeat(word):
                continue
            plain = strip_marks(word)
            if plain != word:
                tanween = judge_tanween(word)
                if tanween is not None and tanween[1] >= min_confidence:
                    before, after = context(text, token.start, token.end)
                    report.findings.append(
                        Finding(index, token.start, token.end, word, tanween[0], 'tanween', tanween[1], before, after)
                    )
                continue
            if word in EXEMPT or word in DIALECT_WORDS:
                continue
            report.judged += 1
            info = lexicon.lookup(word)
            result = judge_variant(word, info)
            suggestion: str | None = None
            family = ''
            confidence = 0.0
            others: tuple[str, ...] = ()
            if result is None and comparative(word) not in (None, word):
                result = (comparative(word) or word, 'hamza', 0.95, ())
            if result is None and info.readings and word in info.spellings:
                nxt = sequence[position + 1] if position + 1 < len(sequence) else None
                feminine = judge_feminine(word, info, nxt, text, lexicon)
                if feminine is not None:
                    result = (feminine[0], 'ta-marbuta', feminine[1], ())
            if result is not None:
                suggestion, family, confidence, others = result
            elif not info.readings and not info.gulf_known:
                typo = judge_typo(word, lexicon)
                if typo is not None:
                    suggestion, confidence = typo
                    family = 'typo'
            if suggestion is None or confidence < min_confidence or suggestion == word:
                continue
            seen[word] = seen.get(word, 0) + 1
            if seen[word] > 3:
                continue
            before, after = context(text, token.start, token.end)
            report.findings.append(
                Finding(index, token.start, token.end, word, suggestion, family, confidence, before, after, others)
            )
        if report.truncated:
            break
    report.findings.sort(key=lambda f: (-f.confidence, f.text_index, f.start))
    del report.findings[max_findings:]
    return report
