import { parseRobotsTxt } from '@arablyzer/collectors/robots'
import { matchRobots, type RobotsMatch } from '@arablyzer/rules/robots-match'

// The robots.txt tester (M2.3b): a pasted robots.txt, an address and a crawler, judged by the
// parser and the matcher the robots rules use, as Google's open-source parser does.

export interface RobotsTestResult extends RobotsMatch {
  /** The groups the file has, for the page to say what it read. */
  readonly groups: number
}

export function robotsTest(robotsTxt: string, url: string, product: string): RobotsTestResult {
  const robots = parseRobotsTxt(new TextEncoder().encode(robotsTxt))
  return { ...matchRobots(robots, product, url), groups: robots.groups.length }
}
