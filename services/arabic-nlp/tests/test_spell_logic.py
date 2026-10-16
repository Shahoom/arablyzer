import time

from arabic_nlp.spell import (
    check_texts,
    families_between,
    family_of,
    judge_tanween,
    judge_variant,
)
from conftest import reading  # noqa: F401  (the helper lives with the fixtures)
from arabic_nlp.lexicon import WordInfo


def run(texts: list[str], lexicon, minimum: float = 0.9):  # noqa: ANN001, ANN201
    return check_texts(texts, lexicon, min_confidence=minimum, max_findings=100, deadline=time.monotonic() + 5)


def test_families_run_one_way_only() -> None:
    assert family_of('ا', 'أ') == 'hamza'
    assert family_of('ه', 'ة') == 'ta-marbuta'
    assert family_of('ي', 'ى') == 'alef-maqsura' and family_of('ى', 'ي') == 'alef-maqsura'
    # a hamza that was written is not changed, and ة is never turned into ه
    assert family_of('أ', 'إ') is None
    assert family_of('ة', 'ه') is None
    assert families_between('الاسره', 'الأسرة') == ['hamza', 'ta-marbuta']
    assert families_between('كتاب', 'كتابة') is None


def test_flags_a_hamza_left_off_with_its_fix(fake) -> None:  # noqa: ANN001
    report = run(['تتميز الاسعار بالمنافسة'], fake)
    assert [(f.word, f.suggestion, f.family) for f in report.findings] == [('الاسعار', 'الأسعار', 'hamza')]
    assert report.findings[0].confidence >= 0.9
    assert report.findings[0].after.startswith('بالمنافسة')


def test_flags_ha_for_ta_marbuta_on_a_definite_noun(fake) -> None:  # noqa: ANN001
    report = run(['في المدرسه الجديدة'], fake)
    assert [(f.word, f.suggestion, f.family) for f in report.findings] == [('المدرسه', 'المدرسة', 'ta-marbuta')]


def test_is_not_sure_when_two_spellings_are_as_likely(fake) -> None:  # noqa: ANN001
    # «ان» may be «أن» or «إن»: the confidence drops under the default, and a lower threshold shows it
    assert run(['يجب ان تكون'], fake).findings == []
    low = run(['يجب ان تكون'], fake, minimum=0.5)
    assert low.findings and low.findings[0].confidence < 0.9
    assert low.findings[0].alternatives == ('إن',)


def test_leaves_names_commands_quotes_and_unattested_words_alone(fake) -> None:  # noqa: ANN001
    for text in ['جاء محمد', 'احصل على الخصم', 'قال «الاسعار» فقط', 'ايفون جديد', 'ثم https://x.y/الاسعار']:
        assert run([text], fake).findings == [], text


def test_the_phrase_is_judged_as_a_whole(fake) -> None:  # noqa: ANN001
    report = run(['نلقاكم انشاء الله غدا'], fake)
    assert [(f.word, f.suggestion, f.family) for f in report.findings] == [('انشاء الله', 'إن شاء الله', 'phrase')]
    # «إنشاء الله» may be the creation of God: under the default threshold, and shown below it
    assert run(['سنفعل إنشاء الله'], fake).findings == []
    assert run(['سنفعل إنشاء الله'], fake, minimum=0.8).findings[0].suggestion == 'إن شاء الله'


def test_tanween_slips() -> None:
    assert judge_tanween('مرةاً') == ('مرةً', 0.96)
    assert judge_tanween('كثيرً') == ('كثيراً', 0.93)
    # all of these are right
    for word in ('شكراً', 'شكرًا', 'مرةً', 'سماءً', 'جداً'):
        assert judge_tanween(word) is None, word


def test_marks_and_elongations_are_not_judged(fake) -> None:  # noqa: ANN001
    assert run(['الاسعارُ'], fake).findings == []
    assert run(['الاسعااار'], fake).findings == []
    assert run(['الـاسعار'], fake).findings == []


def test_a_typo_is_flagged_only_when_one_slip_makes_a_word() -> None:
    from conftest import FakeLexicon

    lexicon = FakeLexicon({'الألوان': WordInfo((reading('الألوان'),))})
    lexicon.words['الألوان'].readings[0].__class__  # noqa: B018
    report = run(['والألووان جميلة'.replace('والألووان', 'الألووان')], lexicon)
    assert [(f.word, f.suggestion, f.family) for f in report.findings] == [('الألووان', 'الألوان', 'typo')]
    # an unknown word with two possible fixes, or none, is left alone
    assert run(['كلمةغريبة'], lexicon).findings == []


def test_a_word_the_lexicon_does_not_know_is_not_flagged(fake) -> None:  # noqa: ANN001
    assert run(['سناب وتويتر هواوي'], fake).findings == []


def test_the_deadline_cuts_the_work_and_says_so(fake) -> None:  # noqa: ANN001
    report = check_texts(['الاسعار ' * 50], fake, min_confidence=0.9, max_findings=10, deadline=time.monotonic() - 1)
    assert report.truncated is True


def test_a_word_is_reported_at_most_three_times(fake) -> None:  # noqa: ANN001
    assert len(run(['الاسعار ' * 10], fake).findings) == 3


def test_judge_variant_needs_an_attested_best_reading() -> None:
    info = WordInfo((reading('إيفون', logprob=-99.0),))
    assert judge_variant('ايفون', info) is None
