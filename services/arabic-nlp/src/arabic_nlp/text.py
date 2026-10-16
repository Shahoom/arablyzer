"""Finding the words a spelling check may judge, and leaving out everything else."""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass

#: Arabic letters, tatweel and the marks, as one run: the word as it was written.
ARABIC_RUN = re.compile('[ء-يٱ-ۓـً-ْٰ]+')
MARKS = re.compile('[ً-ْٰ]')
TANWEEN = 'ًٌٍ'
TATWEEL = 'ـ'
#: What is not the page's own writing: web addresses, mail addresses.
ADDRESSES = re.compile(r'(?:https?://|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+', re.IGNORECASE)
#: A span between quotation marks is mentioned, not written (a page about spelling quotes errors).
QUOTED = re.compile(
    '«[^«»\n]{0,400}»|“[^“”\n]{0,400}”|„[^“”\n]{0,400}[“”]|‹[^‹›\n]{0,400}›|"[^"\n]{0,400}"'
)
#: A letter or sign that joins an Arabic run to something that is not prose (a path, a handle).
JOINS_BEFORE = re.compile(r'[A-Za-z0-9_@#/\\=&%$]')
JOINS_AFTER = re.compile(r'[A-Za-z0-9_@/\\=&%$]|\.[A-Za-z0-9]')


@dataclass(frozen=True)
class Token:
    word: str
    start: int
    end: int


def mask(text: str) -> str:
    """The text with addresses and quoted spans blanked, so that offsets stay the same."""

    def blank(match: re.Match[str]) -> str:
        return ' ' * len(match.group(0))

    return QUOTED.sub(blank, ADDRESSES.sub(blank, text))


def tokens(text: str) -> Iterator[Token]:
    """Arabic words that stand on their own: not glued to Latin letters, digits or a path."""
    shown = mask(text)
    for match in ARABIC_RUN.finditer(shown):
        start, end = match.span()
        before = shown[start - 1] if start > 0 else ''
        after = shown[end : end + 2]
        if before and JOINS_BEFORE.fullmatch(before):
            continue
        if after and JOINS_AFTER.match(after):
            continue
        yield Token(match.group(0), start, end)


def strip_marks(word: str) -> str:
    return MARKS.sub('', word)


def has_long_repeat(word: str, times: int = 3) -> bool:
    """Three or the same letter in a row is an elongation people meant, not a slip."""
    run = 1
    for before, letter in zip(word, word[1:], strict=False):
        run = run + 1 if letter == before else 1
        if run >= times:
            return True
    return False


def context(text: str, start: int, end: int, size: int = 24) -> tuple[str, str]:
    """A little of the text each side of a word, for the finding to show."""
    return text[max(0, start - size) : start].strip(), text[end : end + size].strip()


def arabic_letters(text: str) -> int:
    return sum(len(run) for run in ARABIC_RUN.findall(MARKS.sub('', text)))


def words(text: str) -> int:
    return sum(1 for _ in tokens(text))
