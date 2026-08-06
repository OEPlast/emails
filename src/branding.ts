/**
 * Brand resolution for emails.
 *
 * Every brand value has three sources, in priority order:
 *   1. an override passed in by the host service (Main-server reads the `Settings`
 *      document; event-bus fetches the same document over the internal API),
 *   2. an environment variable,
 *   3. a hardcoded fallback.
 *
 * This is why event-bus emails used to render with no logo: it had no step 1 and there was
 * no step 2 to fall back on. Now a missing Settings document degrades to env values rather
 * than to a blank header.
 */

export interface BrandAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface BrandSocialLinks {
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
  x?: string;
  threads?: string;
}

/** What a host service supplies. Everything is optional; the resolver fills the gaps. */
export interface BrandInput {
  storeName?: string;
  companyName?: string;
  logoUrl?: string;
  storefrontUrl?: string;
  /** Public base URL of the API that serves the unsubscribe endpoint. */
  apiUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: BrandAddress;
  social?: BrandSocialLinks;
}

/** A social icon that survived resolution — i.e. one that has a real URL. */
export interface ResolvedSocialLink {
  name: string;
  url: string;
  iconUrl: string;
}

/** The fully-resolved brand handed to templates. Every field is guaranteed non-empty. */
export interface Brand {
  storeName: string;
  companyName: string;
  logoUrl: string;
  storefrontUrl: string;
  /** Empty when no public API URL is configured; the footer then omits opt-out links. */
  apiUrl: string;
  supportEmail: string;
  supportPhone: string;
  address: BrandAddress;
  /** Single-line postal address for the footer. Empty when nothing is configured. */
  addressLine: string;
  social: ResolvedSocialLink[];
  /** Templates use this instead of `{{#if social}}` so an empty array reads correctly. */
  hasSocial: boolean;
  year: number;
}

const SOCIAL_ICONS: Record<keyof BrandSocialLinks, { name: string; iconUrl: string }> = {
  x: {
    name: 'X',
    iconUrl:
      'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965510/email-template/images/twitter-icon_irb5ks.png',
  },
  facebook: {
    name: 'Facebook',
    iconUrl:
      'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965509/email-template/images/fb-icon_jdwajr.png',
  },
  instagram: {
    name: 'Instagram',
    iconUrl:
      'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965510/email-template/images/ig-icon_lyd5yy.png',
  },
  whatsapp: { name: 'WhatsApp', iconUrl: '' },
  threads: { name: 'Threads', iconUrl: '' },
};

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

/** Strips any trailing slash so `${storefrontUrl}/path` never produces a double slash. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function formatAddress(address: BrandAddress): string {
  return [address.line1, address.line2, address.city, address.state, address.zip, address.country]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

function resolveSocial(social: BrandSocialLinks | undefined): ResolvedSocialLink[] {
  if (!social) return [];

  // Ordered deliberately: the icons we actually have artwork for come first, and any
  // network without a configured URL is dropped rather than rendered as href="#".
  const order: Array<keyof BrandSocialLinks> = ['instagram', 'facebook', 'x', 'whatsapp', 'threads'];

  return order
    .map((key) => {
      const url = firstNonEmpty(social[key]);
      const meta = SOCIAL_ICONS[key];
      if (!url || !meta.iconUrl) return null;
      return { name: meta.name, url, iconUrl: meta.iconUrl };
    })
    .filter((link): link is ResolvedSocialLink => link !== null);
}

/**
 * Merges host-supplied brand values with environment defaults.
 *
 * `STOREFRONT_URL` is checked before `FRONTEND_URL` to match the fallback chain already used
 * by `FeedService` and `MerchantApiService` on Main-server.
 */
export function resolveBrand(input: BrandInput = {}): Brand {
  const env = process.env;

  const storeName = firstNonEmpty(input.storeName, env.STORE_NAME, 'Rawura');
  const address: BrandAddress = {
    line1: firstNonEmpty(input.address?.line1, env.STORE_ADDRESS),
    line2: firstNonEmpty(input.address?.line2),
    city: firstNonEmpty(input.address?.city, env.STORE_CITY),
    state: firstNonEmpty(input.address?.state, env.STORE_STATE),
    zip: firstNonEmpty(input.address?.zip),
    country: firstNonEmpty(input.address?.country, env.STORE_COUNTRY, 'Nigeria'),
  };

  const social = resolveSocial(input.social);

  return {
    storeName,
    companyName: firstNonEmpty(input.companyName, env.COMPANY_NAME, storeName),
    logoUrl: firstNonEmpty(input.logoUrl, env.STORE_LOGO_URL),
    storefrontUrl: normalizeBaseUrl(
      firstNonEmpty(input.storefrontUrl, env.STOREFRONT_URL, env.FRONTEND_URL, 'https://www.rawura.com')
    ),
    apiUrl: normalizeBaseUrl(firstNonEmpty(input.apiUrl, env.PUBLIC_API_URL, env.API_URL)),
    supportEmail: firstNonEmpty(input.supportEmail, env.SUPPORT_EMAIL, env.FROM_EMAIL, 'support@rawura.com'),
    supportPhone: firstNonEmpty(input.supportPhone, env.SUPPORT_PHONE, env.STORE_PHONE),
    address,
    addressLine: formatAddress(address),
    social,
    hasSocial: social.length > 0,
    year: new Date().getFullYear(),
  };
}

/* ------------------------------------------------------------------ */
/* Storefront link builders                                            */
/* ------------------------------------------------------------------ */
/*
 * Centralised because every one of these was previously hand-built at the call site, and
 * every one of them was wrong: order links pointed at `/orders/:id`, which is not a route on
 * the storefront (the real one is `/my-account/orders/:id`), and two of them hardcoded a
 * different company's domain entirely.
 */

export function orderUrl(brand: Brand, orderId: string): string {
  return `${brand.storefrontUrl}/my-account/orders/${orderId}`;
}

export function orderTrackingUrl(brand: Brand, orderId: string): string {
  return `${brand.storefrontUrl}/order-tracking?order=${encodeURIComponent(orderId)}`;
}

export function productUrl(brand: Brand, slug: string): string {
  return `${brand.storefrontUrl}/product/${slug}`;
}

/** Deep link that opens a product page with its review form focused. */
export function productReviewUrl(brand: Brand, slug: string): string {
  return `${brand.storefrontUrl}/product/${slug}?review=1#reviews`;
}

export function shopUrl(brand: Brand): string {
  return `${brand.storefrontUrl}/shop`;
}

export function cartUrl(brand: Brand): string {
  return `${brand.storefrontUrl}/cart`;
}

export function accountUrl(brand: Brand): string {
  return `${brand.storefrontUrl}/my-account`;
}

export function returnsUrl(brand: Brand, orderId: string): string {
  return `${brand.storefrontUrl}/my-account/orders/${orderId}?tab=returns`;
}

export function supportUrl(brand: Brand): string {
  return `${brand.storefrontUrl}/pages/contact-us`;
}

/**
 * One-click unsubscribe link, or '' when no public API URL is configured.
 *
 * Signed with an HMAC of the address by the host service — never a session token. These URLs
 * sit in mail archives forever, so the link must grant nothing beyond stopping marketing
 * email to the address it names. An empty string is returned rather than a guess: the footer
 * omits the link entirely instead of rendering a dead one, which is what the previous
 * `href="#"` amounted to.
 */
export function unsubscribeUrl(brand: Brand, email: string, token?: string): string {
  if (!brand.apiUrl || !token) return '';
  return `${brand.apiUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

/** Where a customer manages which emails they get. Requires them to sign in. */
export function preferencesUrl(brand: Brand): string {
  return `${brand.storefrontUrl}/my-account`;
}
