/**
 * Keep-alive for a Base Server on a sleeping free tier (Render spins a free web service down
 * after 15 min without inbound traffic; the next request then waits ~1 min for a cold start and
 * the in-memory crew state is lost).
 *
 * While any console / phone / visor page is open, GET <api>/health is sent on mount, every
 * `intervalMs`, and whenever the tab becomes visible again. Pinging is skipped for local stacks
 * (localhost, private LAN IPs, *.local), where nothing ever sleeps.
 *
 * NEXT_PUBLIC_KEEPALIVE_MS: ping interval in ms (default 4 min); "0" disables keep-alive.
 */

export const DEFAULT_KEEPALIVE_MS = 4 * 60 * 1000;
const MIN_KEEPALIVE_MS = 30 * 1000;

export function keepAliveIntervalMs(raw: string | undefined = process.env.NEXT_PUBLIC_KEEPALIVE_MS): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_KEEPALIVE_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(MIN_KEEPALIVE_MS, Math.round(value));
}

/** True when the API lives on a remote host that may sleep (not localhost / LAN). */
export function isRemoteApi(apiBase: string): boolean {
  let host: string;
  try {
    host = new URL(apiBase).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === '[::1]' || host === '::1') return false;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

export interface KeepAliveOptions {
  apiBase: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}

/** Starts pinging `<apiBase>/health`; returns a stop function. No-op for local APIs or interval 0. */
export function startKeepAlive({
  apiBase,
  intervalMs = keepAliveIntervalMs(),
  fetchImpl = typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
  doc = typeof document !== 'undefined' ? document : undefined,
}: KeepAliveOptions): () => void {
  if (!fetchImpl || intervalMs <= 0 || !isRemoteApi(apiBase)) return () => {};

  const url = `${apiBase.replace(/\/$/, '')}/health`;
  let inFlight = false;
  let stopped = false;

  const ping = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    fetchImpl(url, { cache: 'no-store' })
      .catch(() => undefined) // cold start / offline: the next tick retries
      .finally(() => {
        inFlight = false;
      });
  };

  const onVisible = () => {
    if (doc?.visibilityState === 'visible') ping();
  };

  ping();
  const timer = setInterval(ping, intervalMs);
  doc?.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearInterval(timer);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
}
