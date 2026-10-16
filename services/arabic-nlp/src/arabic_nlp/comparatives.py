"""Comparatives and superlatives that take a hamza («أفضل»), written by hand.

Each is also the spelling of a first-person verb or a command, which the databases weigh against it, so
the check would leave their hamza-less forms («افضل», «اسرع») alone. In prose they are almost always the
adjective, and the slip is as common as any in Arabic; this list says so, for these words only.
"""

from __future__ import annotations

import re

COMPARATIVES = (
    'أفضل أحسن أسرع أسهل أكبر أصغر أكثر أقل أحدث أقدم أجمل أعلى أدنى أقرب أبعد أرخص أغلى أقوى أوسع '
    'أطول أقصر أبسط أهم أفخم أروع أعظم أسوأ أشهر أدق أعمق أغنى أنسب أمثل أوفر أحلى أنظف أخف أثقل أشد'
).split()

_PREFIX = re.compile('((?:[وفبكل]|ال|وال|بال|كال|فال|لل)*)(.+)')
BY_PLAIN = {word.replace('أ', 'ا'): word for word in COMPARATIVES}


def standard(word: str) -> str | None:
    """The comparative a hamza-less word stands for, with whatever prefix it carries; else None."""
    match = _PREFIX.fullmatch(word)
    if match is None:
        return None
    prefix, stem = match.groups()
    found = BY_PLAIN.get(stem)
    return None if found is None else prefix + found
