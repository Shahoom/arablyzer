import { describe } from 'vitest'
import { MemoryCrawlData } from '../src/index'
import { crawlContract } from './crawl-contract'

describe('MemoryCrawlData', () => {
  crawlContract(() => ({
    crawls: new MemoryCrawlData(),
    user: () => Promise.resolve(),
    site: () => Promise.resolve(),
    scan: () => Promise.resolve(),
  }))
})
