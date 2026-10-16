from arabic_nlp.text import context, has_long_repeat, mask, strip_marks, tokens


def words(text: str) -> list[str]:
    return [token.word for token in tokens(text)]


def test_finds_arabic_words_and_their_offsets() -> None:
    text = 'مرحبا بكم في المتجر'
    found = list(tokens(text))
    assert [t.word for t in found] == ['مرحبا', 'بكم', 'في', 'المتجر']
    assert all(text[t.start : t.end] == t.word for t in found)


def test_leaves_out_quotations_addresses_and_words_glued_to_latin() -> None:
    assert words('كتب «الاسعار غالية» ثم خرج') == ['كتب', 'ثم', 'خرج']
    assert words('زوروا https://example.com/الاسعار الآن') == ['زوروا', 'الآن']
    assert words('راسلنا info@example.com الان') == ['راسلنا', 'الان']
    assert words('ملف app_الاسعار.pdf ثم نص') == ['ملف', 'ثم', 'نص']
    assert words('iPhoneالاسعار نص') == ['نص']
    assert words('"الاسعار" ونص') == ['ونص']


def test_mask_keeps_offsets() -> None:
    text = 'قال «خطأ» ثم https://a.b/c وانتهى'
    assert len(mask(text)) == len(text)


def test_a_repeat_of_three_letters_is_an_elongation() -> None:
    assert has_long_repeat('جميييل')
    assert not has_long_repeat('الألووان')


def test_strips_marks_and_gives_context() -> None:
    assert strip_marks('كَتَبَ') == 'كتب'
    assert context('abcdef ghi', 7, 10, size=3) == ('ef', '')
