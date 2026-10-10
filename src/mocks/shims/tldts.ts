/**
 * Build-time shim for `tldts` (≈185 KB of public-suffix data), aliased in vite.config.ts.
 * It is only pulled in by tough-cookie (MSW's cookie store), which calls getDomain() to validate
 * cookie domains. The mock backend never uses cookies (auth is a bearer token), so the full
 * public-suffix list is dead weight on the critical path of every page load.
 */
export function getDomain(hostname: string | null | undefined): string | null {
  return hostname ?? null;
}

export function getPublicSuffix(hostname: string | null | undefined): string | null {
  return hostname?.split(".").pop() ?? null;
}
