/**
 * How a page's head is drawn, one rule for each kind of page (M2.6 R6). The approved artboards
 * centre the home page's hero and nothing else: every other page opens with its trail, heading and
 * lead at the start of the line, over the tint of a page's head. The classes are written out in
 * full, for Tailwind to find, and kept here so that no two pages of a kind drift apart.
 *
 * - The home page: its own hero (components/home/Hero.astro), centred, over the aurora.
 * - An index (the tools, the rule library, the fix guides, the glossary, the knowledge hub): the
 *   heading is the gradient, and large (`index`).
 * - A page that is one thing (a tool, a rule, a guide, a term, the bot's page, the methodology):
 *   the heading is the page's name, a size smaller (`page`); the gradient for a tool, ink for the
 *   rest.
 * - A state (the 404 page, a report that is not a report): centred, in its own card.
 */
export const HEAD = {
  /** An index page's h1 (and the hub's): wrap its text in `gradient-text`. */
  index: 'm-0 text-[36px] leading-[1.2] font-semibold text-balance md:text-[56px]',
  /** The h1 of a page that is one thing. */
  page: 'm-0 max-w-[900px] text-[32px] leading-[1.3] font-semibold text-balance md:text-[44px] md:leading-[1.25]',
  /** The lead under either. */
  lead: 'm-0 max-w-[720px] text-base leading-[1.85] text-ink-2 md:text-[19px]',
  /** The room above a head's trail. */
  top: 'pt-8 md:pt-12',
  /** The room above a head's trail and below its last line. */
  padding: 'pt-8 pb-10 md:pt-12 md:pb-12',
  /** The room between a head and the body under it. */
  bodyTop: 'pt-8 md:pt-10',
} as const
