import ipaddr from 'ipaddr.js'
import { getDomain } from 'tldts'

/**
 * The per-host limit's key: the site, so its names cannot share it out. A name counts as its
 * registrable domain (shop.example.com and example.com. are example.com; each github.io site is
 * its own), by the Public Suffix List; an address counts as itself, however it is written, with
 * or without the brackets a URL puts an IPv6 address in.
 */
export function hostKey(host: string): string {
  const name = host
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '')
  if (ipaddr.isValid(name)) return `ip:${ipaddr.process(name).toString()}`
  return `domain:${getDomain(name, { allowPrivateDomains: true }) ?? name}`
}

/**
 * The limiter's key for a site's scans. The API counts the site a scan is asked for, and the
 * worker the site the scan ends at, after its redirects (security review, issue #30): both take
 * from the bucket this names, so no site is flooded through another's name.
 */
export const hostLimitKey = (host: string): string => `host:${hostKey(host)}`
