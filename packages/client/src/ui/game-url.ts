const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface PageLocation {
  protocol: string;
  hostname: string;
  port: string;
}

/** Link a phone can open: a loopback host only works on this machine, so it is swapped for the first LAN address. */
export function gameUrl(loc: PageLocation, lanHosts: string[]): string {
  const host = LOOPBACK.has(loc.hostname) && lanHosts.length > 0 ? lanHosts[0] : loc.hostname;
  return `${loc.protocol}//${host}${loc.port ? `:${loc.port}` : ''}/`;
}
