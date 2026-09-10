/**
 * Subject lines, in one place.
 *
 * Previously each service wrote its own, which is how the same order could arrive as
 * "Order Confirmation - undefined" from one service and "...- 671f3c..." from another. Every
 * order subject now quotes the same human-readable `orderNumber`.
 */

import type { EmailBrand } from './branding';
import type { EmailKind, EmailPayloadMap } from './types';
import { formatToNaira, titleCase } from './format';

type SubjectBuilder<K extends EmailKind> = (data: EmailPayloadMap[K], brand: EmailBrand) => string;

type SubjectRegistry = { [K in EmailKind]: SubjectBuilder<K> };

const RETURN_STATUS_SUBJECTS: Record<string, string> = {
  approved: 'Your return has been approved',
  rejected: 'Update on your return request',
  items_received: 'We have received your returned items',
  inspecting: 'Your return is being inspected',
  inspection_passed: 'Your return passed inspection',
  inspection_failed: 'Update on your return inspection',
  completed: 'Your return is complete',
  cancelled: 'Your return has been cancelled',
  pending: 'Your return request is pending review',
};

const registry: SubjectRegistry = {
  'verification-email': (d) => `${d.otpCode} is your verification code`,
  welcome: (_d, brand) => `Welcome to ${brand.storeName}`,
  'forgot-password': (d) => `${d.otpCode} is your password reset code`,
  'password-changed': (_d, brand) => `Your ${brand.storeName} password was changed`,

  'order-confirmation': (d) => `Order confirmed — ${d.orderNumber}`,
  'payment-receipt': (d) => `Payment receipt for order ${d.orderNumber}`,
  'payment-failed': (d) => `Payment failed for order ${d.orderNumber}`,
  'order-shipped': (d) => `Your order ${d.orderNumber} has shipped`,
  'order-delivered': (d) => `Your order ${d.orderNumber} has been delivered`,
  'delivery-failed': (d) => `We could not deliver order ${d.orderNumber}`,
  'order-cancelled': (d) => `Order ${d.orderNumber} has been cancelled`,

  'return-requested': (d) => `We received your return request for order ${d.orderNumber}`,
  'return-status': (d) =>
    `${RETURN_STATUS_SUBJECTS[d.status] ?? `Return ${titleCase(d.status)}`} — order ${d.orderNumber}`,
  'order-refunded': (d) => `Refund of ${formatToNaira(d.refundAmount)} issued for order ${d.orderNumber}`,

  rating: (d) =>
    d.products.length === 1
      ? `How was your ${d.products[0].name}?`
      : `How were the items from order ${d.orderNumber}?`,

  'abandoned-cart': (_d, brand) => `You left something in your ${brand.storeName} cart`,
  coupon: (d) => `${d.discount}% off — use code ${d.couponCode}`,
  wishlist: (d) =>
    d.products.length === 1
      ? `${d.products[0].name} is back in stock`
      : `${d.products.length} wishlist items are back in stock`,
};

export function buildSubject<K extends EmailKind>(kind: K, data: EmailPayloadMap[K], brand: EmailBrand): string {
  const builder = registry[kind] as SubjectBuilder<K>;
  return builder(data, brand);
}

/**
 * Marketing mail needs an unsubscribe header and an opt-out honoured before send;
 * transactional mail must not offer one. Kept next to the subjects so adding an email forces
 * the author to classify it.
 */
const MARKETING_KINDS = new Set<EmailKind>(['abandoned-cart', 'coupon', 'wishlist', 'rating']);

export function isMarketingKind(kind: EmailKind): boolean {
  return MARKETING_KINDS.has(kind);
}
