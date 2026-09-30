export { classifyAddress, vetEndpoint, type AddressVerdict, type EndpointVerdict } from './classify'
export { egressError, type EgressError, type EgressErrorCode } from './errors'
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  safeFetch,
  type FetchHop,
  type FetchResponse,
  type FetchResult,
  type SafeFetchOptions,
} from './fetch'
export { localInterfaceCidrs, publicInterfaceCidrs, type InterfaceMap } from './interfaces'
export { DEFAULT_POLICY, createPolicy, type EgressPolicy, type EgressTarget } from './policy'
export {
  DEFAULT_MAX_REQUESTS,
  PROXY_LOG_LIMIT,
  startProxy,
  type EgressProxy,
  type ProxyOptions,
  type ProxyRefusal,
  type ProxyRefusalCode,
  type ProxyStats,
} from './proxy'
export { IPV4_RANGES, IPV6_RANGES, type SpecialRange } from './ranges'
export {
  createDnsResolver,
  defaultResolver,
  dnsResolver,
  resolveEndpoint,
  systemResolver,
  type DnsResolverOptions,
  type EndpointCheck,
  type ResolvedAddress,
  type Resolver,
} from './resolve'
export { redactUrl } from './redact'
export { MAX_URL_LENGTH, checkUrl, type UrlCheck } from './url'
