"""What the morphology databases say of a written word.

The Modern Standard database (CALIMA MSA r13) says which spellings a word has and how likely each
reading is; the Gulf one (CALIMA GLF 01) says whether the word is Gulf speech written as it is.
Nothing is read at run time but these files, baked into the image at build.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol

#: A reading that the database has never counted carries this log probability.
UNATTESTED = -99.0


@dataclass(frozen=True)
class Reading:
    #: The standard spelling, without marks.
    spelling: str
    #: Likelihood of this reading against the likeliest one of the word: 1.0 is the likeliest.
    score: float
    attested: bool
    pos: str
    lemma: str
    root: str | None
    #: The database's log probability of the lexeme with this part of speech: -99 where it has none.
    logprob: float = UNATTESTED
    #: The best log probability of a verb reading of this spelling that is a Form I verb (a command
    #: «احصل» is spelled like its first-person «أحصل», with no hamza), and of any verb reading.
    command_logprob: float | None = None
    verb_logprob: float | None = None
    #: The best log probability of a reading of this spelling that is not a verb.
    other_logprob: float | None = None


@dataclass(frozen=True)
class WordInfo:
    readings: tuple[Reading, ...] = ()
    #: The Gulf lexicon has some analysis of the word.
    gulf_known: bool = False

    @property
    def spellings(self) -> frozenset[str]:
        return frozenset(reading.spelling for reading in self.readings)

    def score_of(self, spelling: str) -> float:
        return max((r.score for r in self.readings if r.spelling == spelling), default=0.0)


_FOLD = str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و', 'ئ': 'ي', 'ى': 'ي', 'ة': 'ه'})


def fold(text: str) -> str:
    """A lemma or spelling reduced to its skeleton: no marks, one alef, one ya, one ha."""
    return text.translate(_FOLD).replace('\u0640', '')


class Lexicon(Protocol):
    def lookup(self, word: str) -> WordInfo: ...


class CamelLexicon:
    """CAMeL Tools' analyzer over the two databases; slow to build (about 3 s, 450 MB)."""

    def __init__(self, data_root: Path, cache_words: int = 50_000) -> None:
        # camel_tools reads this when it is imported, and looks for <root>/data/<package>.
        os.environ['CAMELTOOLS_DATA'] = str(data_root)
        from camel_tools.morphology.analyzer import Analyzer
        from camel_tools.morphology.database import MorphologyDB
        from camel_tools.utils.dediac import dediac_ar

        self._dediac = dediac_ar
        msa = data_root / 'data' / 'morphology_db' / 'calima-msa-r13' / 'morphology.db'
        glf = data_root / 'data' / 'morphology_db' / 'calima-glf-01' / 'morphology.db'
        self._msa = Analyzer(MorphologyDB(str(msa), 'a'), backoff='NONE')
        self._glf = Analyzer(MorphologyDB(str(glf), 'a'), backoff='NONE')
        self._cached = lru_cache(maxsize=cache_words)(self._lookup)

    def lookup(self, word: str) -> WordInfo:
        return self._cached(word)

    def _lookup(self, word: str) -> WordInfo:
        analyses = self._msa.analyze(word)
        best: dict[str, dict] = {}
        top = max((a.get('pos_lex_logprob') or UNATTESTED for a in analyses), default=UNATTESTED)
        for analysis in analyses:
            spelling = self._dediac(analysis['diac'])
            logprob = analysis.get('pos_lex_logprob')
            logprob = UNATTESTED if logprob is None else float(logprob)
            kept = best.get(spelling)
            if kept is None or logprob > kept['logprob']:
                kept = best[spelling] = {
                    'logprob': logprob,
                    'pos': analysis.get('pos') or '',
                    'lemma': self._dediac(analysis.get('lex') or ''),
                    'root': analysis.get('root') if analysis.get('root') not in (None, 'NTWS') else None,
                    'command': kept['command'] if kept else None,
                    'verb': kept['verb'] if kept else None,
                    'other': kept['other'] if kept else None,
                }
            if analysis.get('pos') != 'verb':
                kept['other'] = logprob if kept['other'] is None else max(kept['other'], logprob)
            if analysis.get('pos') == 'verb':
                kept['verb'] = logprob if kept['verb'] is None else max(kept['verb'], logprob)
                lemma = fold(self._dediac(analysis.get('lex') or ''))
                if str(analysis.get('asp')).lower() in ('i', 'c') and lemma != fold(spelling):
                    kept['command'] = logprob if kept['command'] is None else max(kept['command'], logprob)
        readings = tuple(
            sorted(
                (
                    Reading(
                        spelling=spelling,
                        score=0.0 if kept['logprob'] <= UNATTESTED else math.exp(kept['logprob'] - top),
                        attested=kept['logprob'] > UNATTESTED,
                        pos=kept['pos'],
                        lemma=kept['lemma'],
                        root=kept['root'],
                        logprob=kept['logprob'],
                        command_logprob=kept['command'],
                        verb_logprob=kept['verb'],
                        other_logprob=kept['other'],
                    )
                    for spelling, kept in best.items()
                ),
                key=lambda reading: (-reading.score, reading.spelling),
            )
        )
        gulf = self._glf.analyze(word)
        return WordInfo(readings=readings, gulf_known=len(gulf) > 0)
