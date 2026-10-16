"""Dialect words written the ordinary way, which the databases read as something else.

Written by hand for this service, from what Gulf, Egyptian, Levantine and Maghrebi speakers write in
shops and chat: each is a word of its dialect, not a slip, and a spelling check leaves it alone. The
Gulf database has most Gulf words; this list holds the ones it reads as a conjunction and a noun
(«وايد»), and the common words of the other dialects, which no database here covers.
"""

from __future__ import annotations

GULF = frozenset(
    'وايد واجد شلون شلونك شنو شنهو وش ويش ليش ليه الحين توه توني باجر بجر حيل مرة يبي يبغى تبي تبغى '
    'نبي نبغى ابي ابغى شخبارك شخبار هاي هالحين هلا والله زين عيل يمكن بعد قاعد قاعدين'.split()
)
EGYPTIAN = frozenset(
    'ازاي إزاي عايز عايزة عاوز دلوقتي دلوقت كده كدة ليه فين امتى إمتى ايه إيه مش برضه برضو بتاع بتاعت '
    'خالص اوي قوي ده دي دول علشان عشان لسه لسة'.split()
)
LEVANTINE = frozenset(
    'هلق شو بدي بدك بدو كتير منيح هيك هاد هاي هدول ليش وين شلون لسا لسه كيف يلا ضيعة'.split()
)
MAGHREBI = frozenset(
    'بزاف واش ديال ديالي كيفاش دابا غادي غادية فين علاش شحال هادشي هاد هادي ماشي كاين مزيان بغيت'.split()
)

DIALECT_WORDS: frozenset[str] = GULF | EGYPTIAN | LEVANTINE | MAGHREBI
