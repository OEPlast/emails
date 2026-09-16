/**
 * CDN URL construction for images embedded in email.
 *
 * The base URL is read from `CDN_BASE_URL` with the historical value as the fallback,
 * matching `FeedService`/`MerchantApiService` on Main-server. The previous copies of this
 * file hardcoded the host, so a CDN move would have silently broken every product image in
 * every email while the rest of the platform followed the env var.
 */

const DEFAULT_CDN_BASE_URL = 'https://oeptest.b-cdn.net/';

export function getCdnBaseUrl(): string {
  const configured = (process.env.CDN_BASE_URL ?? '').trim();
  const base = configured.length > 0 ? configured : DEFAULT_CDN_BASE_URL;
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Turns a stored image path into an absolute URL.
 *
 * Returns '' for anything unusable so the template's `{{#if}}` guard can fall back to a
 * placeholder rather than emitting `<img src="undefined">`.
 */
export function getCdnUrl(path: string | undefined | null): string {
  if (!path || typeof path !== 'string' || path.trim().length === 0) return '';

  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    return trimmed;
  }

  return `${getCdnBaseUrl()}${trimmed.startsWith('/') ? trimmed.slice(1) : trimmed}`;
}

/**
 * The URL to use for an image inside an email.
 *
 * The upload pipeline stores every image as WebP with a PNG copy beside it on the CDN
 * (`base.webp` + `base.png`). Outlook on Windows cannot display WebP, so for CDN images email
 * points at the PNG copy. Anything off-CDN is returned unchanged.
 */
export function getEmailImageUrl(path: string | undefined | null): string {
  const url = getCdnUrl(path);
  return isCdnUrl(url) && /\.webp$/i.test(url) ? url.replace(/\.webp$/i, '.png') : url;
}

export function isCdnUrl(url: string): boolean {
  return url.startsWith(getCdnBaseUrl());
}

export function extractPathFromCdnUrl(url: string): string {
  const base = getCdnBaseUrl();
  return url.startsWith(base) ? url.slice(base.length) : url;
}
