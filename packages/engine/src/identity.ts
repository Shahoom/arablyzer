// How Arablyzer names itself, in reports and to the sites it scans. Its own module, so the site
// can show it without loading the engine and its browsers.

export const ENGINE_VERSION = '0.1.0'
/** BUILD-PLAN §1. Arablyzer always identifies itself and never poses as another crawler. */
export const USER_AGENT = 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)'
