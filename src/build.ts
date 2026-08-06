/**
 * Turns a typed payload into a ready-to-send email.
 *
 * Services call this instead of calling the renderer directly, so the subject, HTML body,
 * plain-text body and unsubscribe URL for a given email are always derived from the same
 * data. The old design let each service pick its own subject and text, which is how the two
 * copies drifted.
 */

import { renderEmailTemplate } from './engine';
import { buildSubject, isMarketingKind } from './subjects';
import { buildText } from './text';
import { preferencesUrl, unsubscribeUrl, resolveBrand } from './branding';
import type { Brand, BrandInput } from './branding';
import type { BuiltEmail, EmailKind, EmailPayloadMap } from './types';

/** Everything a template can reference, on top of the payload's own fields. */
export interface TemplateContext {
  brand: Brand;
  /** Pre-rendered links so no template has to build a URL. */
  links: {
    preferences: string;
    /** '' when the deployment has no public API URL configured. */
    unsubscribe: string;
    support: string;
    storefront: string;
  };
  /** Drives whether the footer offers an opt-out. */
  isMarketing: boolean;
  /** Short one-line summary used in the hidden inbox preview text. */
  preheader: string;
}

const PREHEADERS: Record<EmailKind, string> = {
  'verification-email': 'Your verification code is inside.',
  welcome: 'Your account is ready — here is where to start.',
  'forgot-password': 'Your password reset code is inside.',
  'password-changed': 'Your password was just changed.',
  'order-confirmation': 'We have your order and payment. Here are the details.',
  'payment-receipt': 'Your payment receipt.',
  'payment-failed': 'Your payment did not go through — you can retry.',
  'order-shipped': 'Your order is on its way. Tracking details inside.',
  'order-delivered': 'Your order has arrived.',
  'delivery-failed': 'We could not complete delivery — action needed.',
  'order-cancelled': 'Your order has been cancelled.',
  'return-requested': 'We have your return request.',
  'return-status': 'There is an update on your return.',
  'order-refunded': 'Your refund is on its way.',
  rating: 'Tell us how your order went.',
  'abandoned-cart': 'Your cart is still waiting.',
  coupon: 'A discount code, just for you.',
  wishlist: 'Something from your wishlist is available again.',
};

/**
 * Builds the email.
 *
 * @param brandInput brand values from the host service (Settings on Main-server, the
 *        internal branding endpoint on event-bus). Omit it and env defaults are used.
 */
export function buildEmail<K extends EmailKind>(
  kind: K,
  data: EmailPayloadMap[K],
  brandInput: BrandInput | Brand = {},
  options: { unsubscribeToken?: string } = {}
): BuiltEmail {
  // A caller may hand us an already-resolved Brand; re-resolving it is harmless and keeps
  // the signature forgiving.
  const brand: Brand = 'addressLine' in brandInput ? (brandInput as Brand) : resolveBrand(brandInput);

  const isMarketing = isMarketingKind(kind);
  const context: TemplateContext = {
    brand,
    links: {
      preferences: preferencesUrl(brand),
      // Only marketing mail gets one. Offering to unsubscribe from an order receipt would
      // imply we might stop sending them, which we will not and legally need not.
      unsubscribe: isMarketing ? unsubscribeUrl(brand, data.email, options.unsubscribeToken) : '',
      support: `mailto:${brand.supportEmail}`,
      storefront: brand.storefrontUrl,
    },
    isMarketing,
    preheader: PREHEADERS[kind],
  };

  return {
    to: data.email,
    subject: buildSubject(kind, data, brand),
    html: renderEmailTemplate(kind, { ...data, ...context }),
    text: buildText(kind, data, brand, isMarketing, context.links.unsubscribe),
    unsubscribeUrl: context.links.unsubscribe,
    isMarketing,
  };
}
