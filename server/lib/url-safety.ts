import { URL } from 'node:url'
import { lookup } from 'node:dns/promises'

// SSRF protection helper. Validates that a user-supplied URL points to an
// acceptable target before it reaches fetch().
//
// Allowed schemes: http://, https://
// Blocked by default:
//   - loopback (127.0.0.0/8, ::1, localhost variants)
//   - link-local (169.254.0.0/16, fe80::/10)
//   - unique local (fc00::/7)
//   - private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
//   - cloud metadata endpoint (169.254.169.254)
//
// Internal cluster/LAN targets are legitimately used during the setup wizard
// (Jellyfin/Radarr/Sonarr often live on private IPs). By default these are
// still flagged as "private" and rejected, but an operator can opt-in by
// setting ALLOW_PRIVATE_TARGETS=true in the environment. In that mode only
// obviously malicious targets (file://, loopback, metadata IP, non-http(s))
// are rejected.

const ALLOW_PRIVATE_TARGETS = process.env.ALLOW_PRIVATE_TARGETS === 'true'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
])

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

export function assertSafeTargetUrl(input: string): void {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new UnsafeUrlError('invalid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('URL scheme must be http:// or https://')
  }

  const hostname = url.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError('loopback host is not allowed')
  }

  // IPv4 literal checks.
  if (isPrivateIPv4(hostname) || isLoopbackIPv4(hostname) || isLinkLocalIPv4(hostname)) {
    if (!ALLOW_PRIVATE_TARGETS) {
      throw new UnsafeUrlError('private IP addresses are not allowed (set ALLOW_PRIVATE_TARGETS=true to permit LAN/cluster targets)')
    }
  }

  // IPv6 literal checks (strip surrounding brackets if present).
  const ipv6 = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  if (isLoopbackIPv6(ipv6) || isLinkLocalIPv6(ipv6) || isUniqueLocalIPv6(ipv6)) {
    if (!ALLOW_PRIVATE_TARGETS) {
      throw new UnsafeUrlError('private IP addresses are not allowed (set ALLOW_PRIVATE_TARGETS=true to permit LAN/cluster targets)')
    }
  }

  // Cloud metadata endpoint is always blocked, even if private targets are allowed.
  if (hostname === '169.254.169.254' || ipv6 === 'fd00:ec2::254') {
    throw new UnsafeUrlError('cloud metadata endpoint is not allowed')
  }
}

export async function assertSafeTargetUrlResolved(input: string): Promise<void> {
  assertSafeTargetUrl(input)
  const url = new URL(input)

  // If the hostname is already an IP literal we already validated it above.
  if (isIPv4(url.hostname) || isIPv6(url.hostname)) return

  // For hostnames, resolve and ensure none of the resulting IPs are blocked.
  let addresses: string[]
  try {
    addresses = await lookup(url.hostname, { all: true }).then((r) => r.map((a) => a.address))
  } catch {
    // DNS resolution failure: don't leak internal information in the error.
    throw new UnsafeUrlError('could not resolve target host')
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError('could not resolve target host')
  }

  for (const ip of addresses) {
    if (isLoopbackIPv4(ip) || isLinkLocalIPv4(ip)) {
      throw new UnsafeUrlError('target resolves to a disallowed address')
    }
    if (isLoopbackIPv6(ip) || isLinkLocalIPv6(ip) || isUniqueLocalIPv6(ip)) {
      throw new UnsafeUrlError('target resolves to a disallowed address')
    }
    if (ip === '169.254.169.254') {
      throw new UnsafeUrlError('cloud metadata endpoint is not allowed')
    }
    if (!ALLOW_PRIVATE_TARGETS) {
      if (isPrivateIPv4(ip)) {
        throw new UnsafeUrlError('target resolves to a private IP address (set ALLOW_PRIVATE_TARGETS=true to permit LAN/cluster targets)')
      }
    }
  }
}

function isIPv4(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s)
}

function isIPv6(s: string): boolean {
  return s.includes(':')
}

function parseIPv4(s: string): [number, number, number, number] | null {
  const parts = s.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null
  return parts as [number, number, number, number]
}

function isLoopbackIPv4(s: string): boolean {
  const parts = parseIPv4(s)
  return parts !== null && parts[0] === 127
}

function isLinkLocalIPv4(s: string): boolean {
  const parts = parseIPv4(s)
  return parts !== null && parts[0] === 169 && parts[1] === 254
}

function isPrivateIPv4(s: string): boolean {
  const parts = parseIPv4(s)
  if (!parts) return false
  const [a, b, c, d] = parts
  // 10.0.0.0/8
  if (a === 10) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 169.254.0.0/16 is link-local and handled separately, but keep here for completeness.
  if (a === 169 && b === 254) return true
  // 127.0.0.0/8 is loopback and handled separately, but keep here.
  if (a === 127) return true
  // 0.0.0.0/8
  if (a === 0) return true
  return false
}

function isLoopbackIPv6(s: string): boolean {
  return s === '::1' || s === '0:0:0:0:0:0:0:1'
}

function isLinkLocalIPv6(s: string): boolean {
  return s.toLowerCase().startsWith('fe80:')
}

function isUniqueLocalIPv6(s: string): boolean {
  const first = s.toLowerCase().split(':')[0]
  if (!first) return false
  // fc00::/7 means first byte 0xfc or 0xfd.
  const nibble = parseInt(first, 16)
  return !Number.isNaN(nibble) && (nibble & 0xfe00) === 0xfc00
}
