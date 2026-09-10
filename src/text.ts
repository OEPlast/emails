/**
 * Plain-text bodies.
 *
 * These replace the twelve one-line strings the services used to pass as `text:`
 * ("Your order has been shipped." — no order number, no tracking, no total). Clients that
 * strip HTML, screen readers, and spam filters all read this part; it has to carry the same
 * facts as the HTML.
 */

import type { EmailBrand } from './branding';
import { preferencesUrl } from './branding';
import { formatToNaira, formatDateTime, formatDateOnly, greetingName, titleCase } from './format';
import type {
  EmailKind,
  EmailPayloadMap,
  EmailProduct,
  PaymentDetails,
  ShippingInfo,
  DeliveryType,
} from './types';

const RULE = '------------------------------------------------------------';

/**
 * Joins body lines, dropping the null/undefined/false entries that conditional fields
 * produce. An explicit '' is kept — that is how the builders express a blank line between
 * paragraphs.
 */
function lines(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string').join('\n');
}

function productLines(products: EmailProduct[]): string {
  if (products.length === 0) return '(no items)';
  return products
    .map((product) => {
      const qty = typeof product.quantity === 'number' ? ` x${product.quantity}` : '';
      const price =
        typeof product.subtotal === 'number'
          ? formatToNaira(product.subtotal)
          : typeof product.discountPrice === 'number'
            ? formatToNaira(product.discountPrice)
            : typeof product.price === 'number'
              ? formatToNaira(product.price)
              : '';
      const attributes = product.attributes?.length
        ? ` (${product.attributes.map((a) => `${a.name}: ${a.value}`).join(', ')})`
        : '';
      return `  - ${product.name}${attributes}${qty}${price ? ` — ${price}` : ''}`;
    })
    .join('\n');
}

function paymentLines(payment: PaymentDetails): string {
  return lines(
    `  Items:     ${formatToNaira(payment.totalShopping)}`,
    `  Shipping:  ${formatToNaira(payment.shipping)}`,
    payment.tax > 0 ? `  Tax:       ${formatToNaira(payment.tax)}` : null,
    payment.discount > 0 ? `  Discount: -${formatToNaira(payment.discount)}` : null,
    `  Total:     ${formatToNaira(payment.subtotal)}`
  );
}

function shippingLines(shipping: ShippingInfo, deliveryType: DeliveryType | undefined, gigWaybill?: string): string {
  if (deliveryType === 'pickup') {
    return lines(
      'Collection: in-store pickup',
      shipping.pickupAddress ? `  Address: ${shipping.pickupAddress}` : `  Address: ${shipping.address}`,
      shipping.pickupContactName ? `  Contact: ${shipping.pickupContactName}` : null,
      shipping.pickupContactPhone ? `  Phone:   ${shipping.pickupContactPhone}` : null
    );
  }

  return lines(
    deliveryType === 'gig' ? 'Delivery: GIG Logistics' : 'Delivery: courier',
    `  Courier: ${shipping.courier}`,
    `  Address: ${shipping.address}`,
    shipping.recipientName ? `  Recipient: ${shipping.recipientName}` : null,
    shipping.deliveryEstimateLabel ? `  Estimated: ${shipping.deliveryEstimateLabel}` : null,
    gigWaybill ? `  Waybill: ${gigWaybill}` : null
  );
}

function footer(brand: EmailBrand, email: string, isMarketing: boolean, unsubscribe: string): string {
  return lines(
    '',
    RULE,
    `${brand.storeName}${brand.addressLine ? ` — ${brand.addressLine}` : ''}`,
    `Questions? ${brand.supportEmail}${brand.supportPhone ? ` or ${brand.supportPhone}` : ''}`,
    `This email was sent to ${email}.`,
    isMarketing ? `Manage your email preferences: ${preferencesUrl(brand)}` : null,
    isMarketing && unsubscribe ? `Unsubscribe: ${unsubscribe}` : null
  );
}

type TextBuilder<K extends EmailKind> = (data: EmailPayloadMap[K], brand: EmailBrand) => string;
type TextRegistry = { [K in EmailKind]: TextBuilder<K> };

const registry: TextRegistry = {
  'verification-email': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your ${brand.storeName} verification code is: ${d.otpCode}`,
      `It expires in ${d.expiresInMinutes} minutes.`,
      '',
      'If you did not create an account, you can ignore this email.'
    ),

  welcome: (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your ${brand.storeName} account is ready.`,
      '',
      `Start shopping: ${d.startShoppingLink}`,
      '',
      `Need a hand? Reply to this email or write to ${brand.supportEmail}.`
    ),

  'forgot-password': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your ${brand.storeName} password reset code is: ${d.otpCode}`,
      `It expires in ${d.expiresInMinutes} minutes.`,
      '',
      'If you did not request a password reset, ignore this email — your password has not changed.'
    ),

  'password-changed': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your ${brand.storeName} password was changed on ${formatDateTime(d.changedAt)}.`,
      d.ipAddress ? `IP address: ${d.ipAddress}` : null,
      d.device ? `Device: ${d.device}` : null,
      '',
      `If this was not you, secure your account immediately: ${d.supportLink}`
    ),

  'order-confirmation': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Thanks for your order. We have received payment and are getting it ready.`,
      '',
      `Order:    ${d.orderNumber}`,
      `Placed:   ${formatDateTime(d.purchaseDate)}`,
      d.payment.reference ? `Payment:  ${d.payment.reference}` : null,
      '',
      'ITEMS',
      productLines(d.products),
      '',
      'TOTAL',
      paymentLines(d.payment),
      '',
      shippingLines(d.shipping, d.deliveryType, d.gigWaybill),
      '',
      `Track your order: ${d.orderStatusLink}`
    ),

  'payment-receipt': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      'This is your payment receipt.',
      '',
      `Order:     ${d.orderNumber}`,
      `Amount:    ${formatToNaira(d.amount)}`,
      `Method:    ${d.paymentMethod}`,
      `Reference: ${d.paymentReference}`,
      `Paid:      ${formatDateTime(d.paidAt)}`,
      '',
      `View your order: ${d.orderStatusLink}`
    ),

  'payment-failed': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `We could not process your payment of ${formatToNaira(d.amount)} for order ${d.orderNumber}.`,
      d.reason ? `Reason: ${d.reason}` : null,
      d.expiresInMinutes
        ? `We are holding your items for ${d.expiresInMinutes} more minutes before releasing them.`
        : null,
      '',
      `Try again: ${d.retryPaymentLink}`,
      '',
      `No money has left your account. If you were charged, contact ${brand.supportEmail}.`
    ),

  'order-shipped': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Order ${d.orderNumber} is on its way.`,
      '',
      `Tracking number: ${d.trackingNumber}`,
      d.trackingLink ? `Track it: ${d.trackingLink}` : null,
      '',
      shippingLines(d.shipping, d.deliveryType, d.gigWaybill),
      '',
      d.products.length > 0 ? lines('ITEMS', productLines(d.products), '') : null,
      `Manage your order: ${d.manageOrderLink}`
    ),

  'order-delivered': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Order ${d.orderNumber} was delivered on ${formatDateTime(d.deliveredAt)}.`,
      d.courierName ? `Courier: ${d.courierName}` : null,
      d.trackingNumber ? `Tracking: ${d.trackingNumber}` : null,
      d.deliveryAddress ? `Delivered to: ${d.deliveryAddress}` : null,
      '',
      'ITEMS',
      productLines(d.products),
      '',
      `View your order: ${d.viewOrderLink}`,
      d.startReturnLink && d.returnWindowDays
        ? `Something wrong? You have ${d.returnWindowDays} days to start a return: ${d.startReturnLink}`
        : null
    ),

  'delivery-failed': (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `A delivery attempt for order ${d.orderNumber} was unsuccessful.`,
      d.reason ? `Reason: ${d.reason}` : null,
      d.courierName ? `Courier: ${d.courierName}` : null,
      d.deliveryAddress ? `Address tried: ${d.deliveryAddress}` : null,
      '',
      'Your items are safe with us. Confirm or update your delivery details and we will try again.',
      '',
      `Manage your order: ${d.manageOrderLink}`,
      `Talk to us: ${d.supportLink} or ${brand.supportEmail}`
    ),

  'order-cancelled': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Order ${d.orderNumber} was cancelled on ${formatDateTime(d.cancelledAt)}.`,
      d.reason ? `Reason: ${d.reason}` : null,
      '',
      'CANCELLED ITEMS',
      productLines(d.products),
      '',
      typeof d.refundAmount === 'number' && d.refundAmount > 0
        ? lines(
            `A refund of ${formatToNaira(d.refundAmount)} is on its way${
              d.refundEtaDays ? ` and should arrive within ${d.refundEtaDays} business days` : ''
            }.`,
            ''
          )
        : null,
      `Browse the store: ${d.shopLink}`
    ),

  'return-requested': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `We have received your ${d.returnType} request for order ${d.orderNumber}.`,
      '',
      `Return:    ${d.returnNumber}`,
      `Requested: ${formatDateTime(d.requestedAt)}`,
      d.reason ? `Reason:    ${d.reason}` : null,
      typeof d.estimatedRefund === 'number' ? `Estimated refund: ${formatToNaira(d.estimatedRefund)}` : null,
      '',
      'ITEMS',
      productLines(d.items),
      '',
      'Our team reviews returns within 1-2 business days. We will email you as soon as there is an update.',
      '',
      `Track your return: ${d.viewReturnLink}`
    ),

  'return-status': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Return ${d.returnNumber} for order ${d.orderNumber} is now: ${titleCase(d.status)}.`,
      `Updated: ${formatDateTime(d.updatedAt)}`,
      d.adminNotes ? lines('', `Note from our team: ${d.adminNotes}`) : null,
      typeof d.refundAmount === 'number' ? `Refund amount: ${formatToNaira(d.refundAmount)}` : null,
      '',
      'ITEMS',
      productLines(d.items),
      d.returnAddress ? lines('', 'SEND ITEMS TO', `  ${d.returnAddress}`) : null,
      d.returnInstructions ? lines('', d.returnInstructions) : null,
      '',
      `Track your return: ${d.viewReturnLink}`
    ),

  'order-refunded': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your refund of ${formatToNaira(d.refundAmount)} for order ${d.orderNumber} has been issued.`,
      '',
      `Return:    ${d.returnNumber}`,
      `Method:    ${d.refundMethod}`,
      d.refundReference ? `Reference: ${d.refundReference}` : null,
      `Issued:    ${formatDateTime(d.refundedAt)}`,
      d.refundEtaDays ? `Expect it within ${d.refundEtaDays} business days.` : null,
      '',
      'REFUNDED ITEMS',
      productLines(d.returnedProducts),
      '',
      `Refund details: ${d.checkRefundLink}`
    ),

  rating: (d, brand) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Your order ${d.orderNumber} arrived on ${formatDateOnly(d.purchaseDate)}. How did we do?`,
      '',
      ...d.products.map((product) =>
        product.reviewLink ? `  - ${product.name}: ${product.reviewLink}` : `  - ${product.name}`
      ),
      '',
      `Reviews help other shoppers on ${brand.storeName} — thank you.`,
      '',
      `View your order: ${d.viewOrderLink}`
    ),

  'abandoned-cart': (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      'You left these in your cart:',
      productLines(d.cartItems),
      typeof d.cartTotal === 'number' ? lines('', `Cart total: ${formatToNaira(d.cartTotal)}`) : null,
      '',
      `Finish checking out: ${d.cartLink}`
    ),

  coupon: (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      `Here is ${d.discount}% off your next order.`,
      '',
      `Code:    ${d.couponCode}`,
      `Expires: ${formatDateOnly(d.expiryDate)}`,
      typeof d.minimumSpend === 'number' ? `Minimum spend: ${formatToNaira(d.minimumSpend)}` : null,
      `Valid on ${d.productCount} products.`,
      '',
      `Shop now: ${d.useCouponLink}`
    ),

  wishlist: (d) =>
    lines(
      `Hi ${greetingName(d.firstName)},`,
      '',
      'Items from your wishlist are back in stock:',
      productLines(d.products),
      '',
      `View your wishlist: ${d.viewWishlistLink}`
    ),
};

export function buildText<K extends EmailKind>(
  kind: K,
  data: EmailPayloadMap[K],
  brand: EmailBrand,
  isMarketing: boolean,
  unsubscribe = ''
): string {
  const builder = registry[kind] as TextBuilder<K>;
  return `${builder(data, brand)}\n${footer(brand, data.email, isMarketing, unsubscribe)}\n`;
}
