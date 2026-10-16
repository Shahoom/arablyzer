from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))

from arabic_nlp.lexicon import Reading, WordInfo  # noqa: E402

DATA_ROOT = Path(os.environ.get('NLP_DATA_ROOT', '/opt/arabic-nlp/camel'))
HAS_DATA = (DATA_ROOT / 'data' / 'morphology_db' / 'calima-msa-r13' / 'morphology.db').exists()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if HAS_DATA:
        return
    skip = pytest.mark.skip(reason='the baked data packages are not here (run in the image)')
    for item in items:
        if 'data' in item.keywords:
            item.add_marker(skip)


def reading(spelling: str, score: float = 1.0, pos: str = 'noun', logprob: float = -3.5, **extra) -> Reading:  # noqa: ANN003
    return Reading(spelling=spelling, score=score, attested=logprob > -99, pos=pos, lemma=extra.pop('lemma', spelling),
                   root=None, logprob=logprob, **extra)


class FakeLexicon:
    """A lexicon from a dict: the logic of the spelling check, tested with no data."""

    def __init__(self, words: dict[str, WordInfo]) -> None:
        self.words = words

    def lookup(self, word: str) -> WordInfo:
        return self.words.get(word, WordInfo())


@pytest.fixture
def fake() -> FakeLexicon:
    return FakeLexicon(
        {
            'الاسعار': WordInfo((reading('الأسعار'),)),
            'الأسعار': WordInfo((reading('الأسعار'),)),
            'المدرسه': WordInfo((reading('المدرسة'),)),
            'المدرسة': WordInfo((reading('المدرسة'),)),
            'ان': WordInfo((reading('أن', pos='conj_sub'), reading('إن', score=0.9, pos='conj_sub'))),
            'احصل': WordInfo((reading('أحصل', pos='verb', command_logprob=-3.6, verb_logprob=-3.5),)),
            'محمد': WordInfo((reading('محمد', pos='noun_prop'),)),
            'ايفون': WordInfo((reading('إيفون', pos='noun_prop', logprob=-99.0),)),
        }
    )
