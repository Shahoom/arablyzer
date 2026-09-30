import type { FixGuideDefinition } from './fix'
import { definition as alternatePageWithProperCanonicalTag } from './fix/alternate-page-with-proper-canonical-tag/guide'
import { definition as blockedDueToAccessForbidden403 } from './fix/blocked-due-to-access-forbidden-403/guide'
import { definition as blockedDueToUnauthorizedRequest401 } from './fix/blocked-due-to-unauthorized-request-401/guide'
import { definition as crawledCurrentlyNotIndexed } from './fix/crawled-currently-not-indexed/guide'
import { definition as discoveredCurrentlyNotIndexed } from './fix/discovered-currently-not-indexed/guide'
import { definition as duplicateGoogleChoseDifferentCanonicalThanUser } from './fix/duplicate-google-chose-different-canonical-than-user/guide'
import { definition as duplicateWithoutUserSelectedCanonical } from './fix/duplicate-without-user-selected-canonical/guide'
import { definition as notFound404 } from './fix/not-found-404/guide'
import { definition as pageWithRedirect } from './fix/page-with-redirect/guide'
import { definition as redirectError } from './fix/redirect-error/guide'
import { definition as serverError5xx } from './fix/server-error-5xx/guide'
import { definition as soft404 } from './fix/soft-404/guide'
import { definition as urlBlockedByRobotsTxt } from './fix/url-blocked-by-robots-txt/guide'
import { definition as urlBlockedDueToOther4xxIssue } from './fix/url-blocked-due-to-other-4xx-issue/guide'
import { definition as urlMarkedNoindex } from './fix/url-marked-noindex/guide'

/**
 * Every /fix guide, in the order the Page indexing report lists its reasons (Google's
 * documentation), without its copy: what links to a guide needs its slug and message alone.
 */
export const FIX_GUIDE_DEFINITIONS: readonly FixGuideDefinition[] = [
  serverError5xx,
  redirectError,
  urlBlockedByRobotsTxt,
  urlMarkedNoindex,
  soft404,
  blockedDueToUnauthorizedRequest401,
  notFound404,
  blockedDueToAccessForbidden403,
  urlBlockedDueToOther4xxIssue,
  crawledCurrentlyNotIndexed,
  discoveredCurrentlyNotIndexed,
  alternatePageWithProperCanonicalTag,
  duplicateWithoutUserSelectedCanonical,
  duplicateGoogleChoseDifferentCanonicalThanUser,
  pageWithRedirect,
]
