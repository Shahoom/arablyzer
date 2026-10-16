"""With the real data packages (in the image): what the databases and the model say, and how well the check does."""

import json
import time
from pathlib import Path

import pytest
from conftest import DATA_ROOT

from arabic_nlp.dialect import CamelDialectModel, classify
from arabic_nlp.lexicon import CamelLexicon
from arabic_nlp.spell import check_texts

pytestmark = pytest.mark.data
FIXTURES = Path(__file__).resolve().parent / 'fixtures'


@pytest.fixture(scope='module')
def lexicon() -> CamelLexicon:
    return CamelLexicon(DATA_ROOT)


@pytest.fixture(scope='module')
def model() -> CamelDialectModel:
    return CamelDialectModel(DATA_ROOT)


def rows(split: str) -> list[dict]:
    out = []
    for file in sorted(FIXTURES.glob('spelling-*.jsonl')):
        out += [json.loads(line) for line in file.read_text(encoding='utf-8').splitlines()]
    return [row for row in out if split in ('all', row['split'])]


def measure(split: str, lexicon: CamelLexicon) -> tuple[int, int, int]:
    tp = fp = labelled = 0
    for row in rows(split):
        want = {e['wrong']: e['right'] for e in row['errors']}
        labelled += sum(row['text'].count(w) for w in want)
        report = check_texts([row['text']], lexicon, min_confidence=0.9, max_findings=100, deadline=time.monotonic() + 30)
        for finding in report.findings:
            if want.get(finding.word) == finding.suggestion:
                tp += 1
            else:
                fp += 1
    return tp, fp, labelled


def test_the_known_slips(lexicon: CamelLexicon) -> None:
    for wrong, right in {'الاسعار': 'الأسعار', 'المدرسه': 'المدرسة', 'مستشفي': 'مستشفى', 'فى': 'في', 'الذى': 'الذي', 'الى': 'إلى'}.items():
        report = check_texts([f'هذه {wrong} هنا'], lexicon, min_confidence=0.9, max_findings=5, deadline=time.monotonic() + 10)
        assert [(f.word, f.suggestion) for f in report.findings] == [(wrong, right)]


def test_correct_words_and_gulf_speech_are_left_alone(lexicon: CamelLexicon) -> None:
    text = 'وايد حلو شلونك الحين شنو وش ليش مسؤول الأسعار إلى على حتى مستشفى المدرسة أحمد إبراهيم احصل اطلب اضغط ابدأ'
    assert check_texts([text], lexicon, min_confidence=0.5, max_findings=50, deadline=time.monotonic() + 10).findings == []


def test_precision_on_the_labelled_sentences(lexicon: CamelLexicon) -> None:
    # The numbers are in the plan; this holds the line: 9 in 10 at least, on the holdout alone and on all.
    for split in ('holdout', 'all'):
        tp, fp, labelled = measure(split, lexicon)
        assert tp + fp >= 20
        assert tp / (tp + fp) >= 0.9, (split, tp, fp)
        assert tp / labelled >= 0.6, (split, tp, labelled)


def test_the_dialect_model_tells_the_five_varieties_apart(model: CamelDialectModel) -> None:
    sentences = [json.loads(line) for line in (FIXTURES / 'dialect.jsonl').read_text(encoding='utf-8').splitlines()]
    right = 0
    for row in sentences:
        right += classify([row['text']], model, time.monotonic() + 30).label == row['label']
    assert right / len(sentences) >= 0.9
    for variety in ('msa', 'gulf', 'egyptian', 'levantine', 'maghrebi'):
        own = [row['text'] for row in sentences if row['label'] == variety]
        assert classify(own[:5], model, time.monotonic() + 30).label == variety
