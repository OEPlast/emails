/**
 * The brand values an email renders.
 *
 * `EmailBrand` only DESCRIBES what the templates, subjects and plain-text bodies read. This
 * package never resolves a brand: it has no settings lookup, no environment fallbacks and no
 * defaults. The host service owns brand resolution end to end and passes any object that is
 * structurally compatible with this interface — extra fields are fine and are ignored.
 */

/** A social link the footer renders as an icon. Hosts should drop networks with no URL. */
export interface EmailSocialLink {
  name: string;
  url: string;
  iconUrl: string;
}

/** Exactly the brand fields this package reads. Nothing more. */
export interface EmailBrand {
  storeName: string;
  companyName: string;
  logoUrl: string;
  /** Base storefront URL with no trailing slash. */
  storefrontUrl: string;
  /** Public API base URL with no trailing slash. Empty omits the one-click unsubscribe link. */
  apiUrl: string;
  supportEmail: string;
  supportPhone: string;
  /** Single-line postal address for the footer. Empty hides it. */
  addressLine: string;
  social: EmailSocialLink[];
  /** Templates use this instead of `{{#if social}}` so an empty array reads correctly. */
  hasSocial: boolean;
  year: number;
}

/**
 * One-click unsubscribe link, or '' when no public API URL or token is available.
 *
 * Signed with an HMAC of the address by the host service — never a session token. These URLs
 * sit in mail archives forever, so the link must grant nothing beyond stopping marketing
 * email to the address it names. An empty string is returned rather than a guess: the footer
 * omits the link entirely instead of rendering a dead one.
 */
export function unsubscribeUrl(brand: EmailBrand, email: string, token?: string): string {
  if (!brand.apiUrl || !token) return '';
  return `${brand.apiUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

/** Where a customer manages which emails they get. Requires them to sign in. */
export function preferencesUrl(brand: EmailBrand): string {
  return `${brand.storefrontUrl}/my-account`;
}
