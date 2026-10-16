"""Which Arabic a text is written in: CAMeL Tools' six-way dialect model over its sentences."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Protocol

from .text import arabic_letters, mask

VARIETIES = ('msa', 'gulf', 'egyptian', 'levantine', 'maghrebi')
#: The model's labels (MADAR's six cities) and the variety each stands for.
LABELS = {'MSA': 'msa', 'DOH': 'gulf', 'CAI': 'egyptian', 'BEI': 'levantine', 'RAB': 'maghrebi', 'TUN': 'maghrebi'}
SENTENCE_END = re.compile(r'[.!?؟…\n\r]+')
MIN_CHUNK_WORDS = 8
MAX_CHUNK_WORDS = 60
MAX_CHUNKS = 200


class DialectModel(Protocol):
    def scores(self, chunks: list[str]) -> list[dict[str, float]]: ...


class CamelDialectModel:
    def __init__(self, data_root) -> None:  # noqa: ANN001
        import os

        os.environ['CAMELTOOLS_DATA'] = str(data_root)
        from camel_tools.dialectid.model6 import DIDModel6

        self._model = DIDModel6.pretrained()

    def scores(self, chunks: list[str]) -> list[dict[str, float]]:
        return [dict(pred.scores) for pred in self._model.predict(chunks, output='label')]


@dataclass
class Result:
    label: str | None
    probabilities: dict[str, float]
    votes: dict[str, int]
    chunks: int
    words: int
    truncated: bool = False
    notes: list[str] = field(default_factory=list)


def chunks_of(texts: list[str]) -> list[str]:
    """Sentences of 8 to 60 words: short ones are joined to the next, long ones cut."""
    out: list[str] = []
    for text in texts:
        pending: list[str] = []
        for sentence in SENTENCE_END.split(mask(text)):
            if arabic_letters(sentence) < 3:
                continue
            pending.extend(sentence.split())
            while len(pending) >= MAX_CHUNK_WORDS:
                out.append(' '.join(pending[:MAX_CHUNK_WORDS]))
                pending = pending[MAX_CHUNK_WORDS:]
            if len(pending) >= MIN_CHUNK_WORDS:
                out.append(' '.join(pending))
                pending = []
        if len(pending) >= 3:
            out.append(' '.join(pending))
    return out


def classify(texts: list[str], model: DialectModel, deadline: float) -> Result:
    """The mix of varieties across the texts, weighted by each sentence's words."""
    chunks = chunks_of(texts)
    truncated = len(chunks) > MAX_CHUNKS
    chunks = chunks[:MAX_CHUNKS]
    mass = dict.fromkeys(VARIETIES, 0.0)
    votes = dict.fromkeys(VARIETIES, 0)
    total = 0
    done = 0
    for start in range(0, len(chunks), 20):
        if time.monotonic() > deadline:
            truncated = True
            break
        batch = chunks[start : start + 20]
        for chunk, scores in zip(batch, model.scores(batch), strict=True):
            weight = len(chunk.split())
            total += weight
            done += 1
            grouped = dict.fromkeys(VARIETIES, 0.0)
            for label, probability in scores.items():
                grouped[LABELS[label]] += float(probability)
            for variety in VARIETIES:
                mass[variety] += weight * grouped[variety]
            votes[max(grouped, key=grouped.__getitem__)] += 1
    if total == 0:
        return Result(None, dict.fromkeys(VARIETIES, 0.0), votes, 0, 0, truncated)
    probabilities = {variety: round(mass[variety] / total, 4) for variety in VARIETIES}
    label = max(probabilities, key=probabilities.__getitem__)
    return Result(label, probabilities, votes, done, total, truncated)
