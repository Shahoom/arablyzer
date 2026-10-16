"""Tokens with their lemma, root and part of speech, where the databases have them."""

from __future__ import annotations

import time
from dataclasses import dataclass

from .lexicon import Lexicon
from .text import strip_marks, tokens


@dataclass(frozen=True)
class Analysis:
    text_index: int
    start: int
    end: int
    word: str
    known: bool
    gulf: bool
    spelling: str | None = None
    lemma: str | None = None
    root: str | None = None
    pos: str | None = None


def analyze_texts(
    texts: list[str], lexicon: Lexicon, *, max_tokens: int, deadline: float
) -> tuple[list[Analysis], bool]:
    out: list[Analysis] = []
    for index, text in enumerate(texts):
        for token in tokens(text):
            if len(out) >= max_tokens or time.monotonic() > deadline:
                return out, True
            info = lexicon.lookup(strip_marks(token.word))
            top = info.readings[0] if info.readings else None
            out.append(
                Analysis(
                    index, token.start, token.end, token.word,
                    known=top is not None, gulf=info.gulf_known and not info.readings,
                    spelling=top.spelling if top else None,
                    lemma=top.lemma if top else None,
                    root=top.root if top else None,
                    pos=top.pos if top else None,
                )
            )
    return out, False
