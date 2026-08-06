/**
 * Email payload types.
 *
 * Reconciled from the two copies that used to live in `Main-server/src/types/email-data.ts`
 * and `event-bus/src/types/email-data.ts`.
 *
 * NOTE: `EmailUser` deliberately does NOT extend `Record<string, unknown>`. The Main-server
 * copy did, and that index signature is what allowed `data.invoiceNumber` — a field that has
 * never existed on any payload — to compile and ship `Order Confirmation - undefined` to
 * customers. Keep these interfaces closed so a missing field is a build error.
 */

/** Base recipient information carried by every email. */
export interface EmailUser {
  firstName?: string;
  lastName?: string;
  email: string;
}

/** A product line as it appears in an email. */
export interface EmailProduct {
  name: string;
  /** Relative CDN path or absolute URL. Rendered through the `cdnUrl` helper. */
  imagePath: string;
  /** Product slug, used to build storefront/review deep links. */
  slug?: string;
  price?: number;
  discountPrice?: number;
  category?: string;
  quantity?: number;
  subtotal?: number;
  /** Absolute link to the product's review form. Built by the payload builder, never guessed. */
  reviewLink?: string;
  /** Per-item attributes chosen at checkout (e.g. Colour / Blue). */
  attributes?: Array<{ name: string; value: string }>;
}

/** How an order reaches the customer. Drives which shipping block a template renders. */
export type DeliveryType = 'shipping' | 'pickup' | 'gig';

/** Shipping / pickup details. Which fields are populated depends on `deliveryType`. */
export interface ShippingInfo {
  courier: string;
  address: string;
  _id?: string;
  /** e.g. "2 - 5 days". Shipping and GIG only. */
  deliveryEstimateLabel?: string;
  /** Pickup only. */
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupAddress?: string;
  /** Recipient of the delivery, when it differs from the account holder. */
  recipientName?: string;
  recipientPhone?: string;
}

/** Money breakdown for an order. All values are in the store's base currency (NGN). */
export interface PaymentDetails {
  /** Line-item total before shipping, tax and discount. */
  totalShopping: number;
  shipping: number;
  tax: number;
  discount: number;
  /** The amount actually charged. */
  subtotal: number;
  /** Human label for the payment method, e.g. "Card", "Bank Transfer". */
  method?: string;
  /** Gateway reference, shown so support can match the mail to a transaction. */
  reference?: string;
}

/** Fields shared by every order-scoped email so headers read identically across the set. */
export interface OrderEmailBase extends EmailUser {
  /** Human-readable order reference (e.g. RW-2608-00417). Never the raw Mongo _id. */
  orderNumber: string;
  /** Raw id, used only to build links. */
  orderId: string;
  purchaseDate: Date | string;
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/** Signup email verification with a one-time code. */
export interface VerificationEmailData extends EmailUser {
  otpCode: string;
  expiresInMinutes: number;
}

/** Sent once an account has been verified. */
export interface WelcomeEmailData extends EmailUser {
  startShoppingLink: string;
  welcomeImageUrl?: string;
}

/** Password reset with a one-time code. */
export interface ForgotPasswordData extends EmailUser {
  otpCode: string;
  expiresInMinutes: number;
}

/** Security notice confirming a password was changed. */
export interface PasswordChangedData extends EmailUser {
  changedAt: Date | string;
  /** Best-effort request context so the customer can spot a change they did not make. */
  ipAddress?: string;
  device?: string;
  supportLink: string;
}

/* ------------------------------------------------------------------ */
/* Order lifecycle                                                     */
/* ------------------------------------------------------------------ */

/** Order paid and confirmed. The most detail-heavy email in the set. */
export interface OrderConfirmationData extends OrderEmailBase {
  shipping: ShippingInfo;
  products: EmailProduct[];
  payment: PaymentDetails;
  orderStatusLink: string;
  deliveryType: DeliveryType;
  /** GIG waybill number. Present only when `deliveryType === 'gig'`. */
  gigWaybill?: string;
}

/** Standalone payment receipt for the transaction behind an order. */
export interface PaymentReceiptData extends OrderEmailBase {
  amount: number;
  paymentMethod: string;
  paymentReference: string;
  paidAt: Date | string;
  orderStatusLink: string;
}

/** Payment attempt did not go through. */
export interface PaymentFailedData extends OrderEmailBase {
  amount: number;
  paymentMethod?: string;
  reason?: string;
  retryPaymentLink: string;
  /** Minutes left before the order is released and stock returned. */
  expiresInMinutes?: number;
}

/** Order handed to the courier. */
export interface OrderShippedData extends OrderEmailBase {
  trackingNumber: string;
  orderStatus: string;
  shipping: ShippingInfo;
  products: EmailProduct[];
  manageOrderLink: string;
  trackingLink?: string;
  deliveryType?: DeliveryType;
  gigWaybill?: string;
}

/** Order delivered. */
export interface OrderDeliveredData extends OrderEmailBase {
  products: EmailProduct[];
  viewOrderLink: string;
  deliveredAt: Date | string;
  trackingNumber?: string;
  courierName?: string;
  deliveryAddress?: string;
  /** Deep link to open a return request while the window is still open. */
  returnWindowDays?: number;
  startReturnLink?: string;
}

/** A delivery attempt failed and needs the customer to act. */
export interface DeliveryFailedData extends OrderEmailBase {
  trackingNumber?: string;
  courierName?: string;
  deliveryAddress?: string;
  reason?: string;
  manageOrderLink: string;
  supportLink: string;
}

/** Order cancelled, by the customer or by an admin. */
export interface OrderCancelledData extends OrderEmailBase {
  products: EmailProduct[];
  reason?: string;
  cancelledAt: Date | string;
  /** Set when money had already been captured and is being returned. */
  refundAmount?: number;
  refundEtaDays?: number;
  shopLink: string;
}

/* ------------------------------------------------------------------ */
/* Returns & refunds                                                   */
/* ------------------------------------------------------------------ */

export type ReturnStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'items_received'
  | 'inspecting'
  | 'inspection_passed'
  | 'inspection_failed'
  | 'completed'
  | 'cancelled';

/** Return request received and awaiting review. */
export interface ReturnRequestedData extends OrderEmailBase {
  returnId: string;
  returnNumber: string;
  returnType: 'refund' | 'exchange';
  reason?: string;
  requestedAt: Date | string;
  items: EmailProduct[];
  estimatedRefund?: number;
  viewReturnLink: string;
}

/**
 * Every post-request return transition. One template driven by `status` rather than
 * eight near-identical files.
 */
export interface ReturnStatusData extends OrderEmailBase {
  returnId: string;
  returnNumber: string;
  returnType: 'refund' | 'exchange';
  status: ReturnStatus;
  updatedAt: Date | string;
  items: EmailProduct[];
  /** Admin's explanation. Surfaced verbatim — this is the "why" for a rejection. */
  adminNotes?: string;
  refundAmount?: number;
  /** Instructions for shipping items back, present once a return is approved. */
  returnAddress?: string;
  returnInstructions?: string;
  viewReturnLink: string;
}

/** Money has actually left the store and is on its way back to the customer. */
export interface OrderRefundedData extends OrderEmailBase {
  returnId: string;
  returnNumber: string;
  returnedProducts: EmailProduct[];
  refundAmount: number;
  refundMethod: string;
  refundReference?: string;
  refundedAt: Date | string;
  /** Business days until the money lands, which depends on the method. */
  refundEtaDays?: number;
  shipping?: ShippingInfo;
  checkRefundLink: string;
}

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

/** Post-delivery review request. */
export interface RatingRequestData extends OrderEmailBase {
  products: EmailProduct[];
  viewOrderLink: string;
}

/** Items left in the cart. Template maintained; no scheduler wired yet. */
export interface AbandonedCartData extends EmailUser {
  cartItems: EmailProduct[];
  cartLink: string;
  cartTotal?: number;
}

/** Promotional coupon. Template maintained; no scheduler wired yet. */
export interface CouponData extends EmailUser {
  discount: number;
  couponCode: string;
  expiryDate: Date | string;
  productCount: number;
  useCouponLink: string;
  minimumSpend?: number;
}

/** Wishlist items back in stock. Template maintained; no scheduler wired yet. */
export interface WishlistData extends EmailUser {
  products: EmailProduct[];
  viewWishlistLink: string;
}

/* ------------------------------------------------------------------ */
/* Kind → payload map                                                  */
/* ------------------------------------------------------------------ */

/**
 * The single registry of every email the platform can send. Adding an entry here and a
 * template file of the same name is all that is needed to introduce a new email; `buildEmail`
 * and the preview harness both derive from this map.
 */
export interface EmailPayloadMap {
  'verification-email': VerificationEmailData;
  welcome: WelcomeEmailData;
  'forgot-password': ForgotPasswordData;
  'password-changed': PasswordChangedData;
  'order-confirmation': OrderConfirmationData;
  'payment-receipt': PaymentReceiptData;
  'payment-failed': PaymentFailedData;
  'order-shipped': OrderShippedData;
  'order-delivered': OrderDeliveredData;
  'delivery-failed': DeliveryFailedData;
  'order-cancelled': OrderCancelledData;
  'return-requested': ReturnRequestedData;
  'return-status': ReturnStatusData;
  'order-refunded': OrderRefundedData;
  rating: RatingRequestData;
  'abandoned-cart': AbandonedCartData;
  coupon: CouponData;
  wishlist: WishlistData;
}

export type EmailKind = keyof EmailPayloadMap;

/** A fully rendered email, ready to hand to a transport. */
export interface BuiltEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Populated so transports can set List-Unsubscribe without re-deriving it. */
  unsubscribeUrl: string;
  /** Transactional mail must not carry a one-click unsubscribe; marketing mail must. */
  isMarketing: boolean;
}
