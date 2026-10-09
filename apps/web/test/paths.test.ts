import { ACCOUNT_PAGE_PATH, LOGIN_PAGE_PATH } from '@arablyzer/api-contract/codes'
import { PATHS } from '@arablyzer/seo/site'
import { describe, expect, it } from 'vitest'

// The API redirects the browser to these after Google, and the site serves the pages at PATHS: two
// places that must name the same addresses.
describe('the account pages', () => {
  it('are where the API sends the browser', () => {
    expect(LOGIN_PAGE_PATH).toBe(PATHS.login)
    expect(ACCOUNT_PAGE_PATH).toBe(PATHS.account)
  })
})
