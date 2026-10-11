/**
 * How a page's head is drawn, one rule for each kind of page (M2.6 R6, scaled in R7a). The approved
 * artboards centre the home page's hero and nothing else: every other page opens with its trail,
 * heading and lead at the start of the line, on a white band ruled by a hairline (R8; the faint
 * teal tint they had before was a wash, which the home page's hero alone keeps).
 * The classes are written out in full, for Tailwind to find, and kept here so that no two pages of
 * a kind drift apart.
 *
 * - The home page: its own hero (components/home/Hero.astro), centred, over the aurora. It is the
 *   one heading with a gradient phrase.
 * - Every other page: the h1 is solid ink, 28 px on a phone and 40 px from lg (`heading-1`), the
 *   same on an index (the tools, the rule library, the fix guides, the glossary, the hub) as on a
 *   page that is one thing (a tool, a rule, a guide, a term, the bot's page, the methodology).
 *   Under it a lead of one or two lines (`lead`).
 * - A state (the 404 page, a report that is not a report): centred, in its own card.
 */
export const HEAD = {
  /** An index page's h1 (and the hub's): solid ink, never a gradient. */
  index: 'heading-1',
  /** The h1 of a page that is one thing: the same scale as an index's. */
  page: 'heading-1 max-w-[760px]',
  /** The lead under either: a line or two, 16 px on a phone and 18 px from lg. */
  lead: 'lead',
  /** The room above a head's trail (a head that is not in a PageHead or a DocPage). */
  top: 'pt-5 lg:pt-10',
  /** The room above a head's trail and below its last line. */
  padding: 'pt-5 pb-6 lg:pt-10 lg:pb-10',
  /** The room between a head and the body under it. */
  bodyTop: 'pt-6 lg:pt-10',
} as const
