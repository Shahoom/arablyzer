export { classifyAddress, vetEndpoint, type AddressVerdict, type EndpointVerdict } from './classify'
export { dnsName, MAX_DNS_LABEL_LENGTH, MAX_DNS_NAME_LENGTH } from './dns-name'
export {
  createDohTxtResolver,
  decodeTxtAnswer,
  DEFAULT_DOH_URL,
  DOH_TIMEOUT_MS,
  DOH_URL_VARIABLE,
  dohQueryUrl,
  dohUrlFrom,
  encodeTxtQuery,
  MAX_DNS_MESSAGE_BYTES,
  type DohOptions,
} from './doh'
export { egressError, type EgressError, type EgressErrorCode } from './errors'
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  safeFetch,
  type CertificateValidity,
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
  ALLOW_PRIVATE_VARIABLE,
  DENY_CIDRS_VARIABLE,
  EGRESS_PROXY_VARIABLE,
  serverPolicy,
} from './server-policy'
export {
  openTunnel,
  UPSTREAM_CONNECT_TIMEOUT_MS,
  type Tunnel,
  type UpstreamRefusalCode,
} from './upstream'
export {
  createDnsResolver,
  createTxtResolver,
  defaultResolver,
  dnsResolver,
  resolveEndpoint,
  systemResolver,
  type DnsResolverOptions,
  type EndpointCheck,
  type ResolvedAddress,
  type Resolver,
  type TxtAnswer,
  type TxtResolver,
} from './resolve'
export { redactUrl } from './redact'
export { smokescreenConfig } from './smokescreen'
export { MAX_URL_LENGTH, checkUrl, type UrlCheck } from './url'
