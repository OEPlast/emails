/**
 * Realistic fixtures for every email, including the edge cases that produced the bugs this
 * work exists to fix: pickup orders, GIG orders with a waybill, missing product images,
 * missing first names, zero discount, and long item lists.
 */

import type { EmailKind, EmailPayloadMap, EmailProduct } from '../src/types';

const NOW = new Date('2026-08-05T14:32:00Z');
const EARLIER = new Date('2026-08-01T09:15:00Z');

const bucket: EmailProduct = {
  name: 'Heavy-Duty 60L Storage Bucket with Lid',
  imagePath: '/gallery/bucket-60l.png',
  slug: 'heavy-duty-60l-storage-bucket',
  category: 'Storage',
  price: 12500,
  quantity: 2,
  subtotal: 25000,
  attributes: [{ name: 'Colour', value: 'Slate Grey' }],
};

const chair: EmailProduct = {
  name: 'Stackable Plastic Chair',
  imagePath: '/gallery/chair-stack.png',
  slug: 'stackable-plastic-chair',
  category: 'Furniture',
  price: 9800,
  discountPrice: 7900,
  quantity: 4,
  subtotal: 31600,
};

/** Deliberately image-less: the product-list partial must show a placeholder, not a broken img. */
const crate: EmailProduct = {
  name: 'Ventilated Produce Crate',
  imagePath: '',
  slug: 'ventilated-produce-crate',
  category: 'Storage',
  price: 4200,
  quantity: 1,
  subtotal: 4200,
};

const withReviewLinks = (products: EmailProduct[]): EmailProduct[] =>
  products.map((p) => ({ ...p, reviewLink: `https://www.rawura.com/product/${p.slug}?review=1#reviews` }));

const orderBase = {
  email: 'ada.okonkwo@example.com',
  firstName: 'Ada',
  lastName: 'Okonkwo',
  orderNumber: 'RW-2608-00417',
  orderId: '66b0f2c9a41d3e0012ab77f4',
  purchaseDate: EARLIER,
};

/**
 * The default fixture per email kind. `variants` below adds the awkward cases.
 */
export const fixtures: { [K in EmailKind]: EmailPayloadMap[K] } = {
  'verification-email': {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    otpCode: '482913',
    expiresInMinutes: 10,
  },

  welcome: {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    startShoppingLink: 'https://www.rawura.com/shop',
  },

  'forgot-password': {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    otpCode: '739104',
    expiresInMinutes: 15,
  },

  'password-changed': {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    changedAt: NOW,
    ipAddress: '105.112.44.9',
    device: 'Chrome on Windows',
    supportLink: 'https://www.rawura.com/pages/contact-us',
  },

  'order-confirmation': {
    ...orderBase,
    deliveryType: 'shipping',
    products: [bucket, chair, crate],
    payment: {
      totalShopping: 60800,
      shipping: 3500,
      tax: 0,
      discount: 5000,
      subtotal: 59300,
      method: 'Card',
      reference: 'PSK_7f3a91bc22',
    },
    shipping: {
      courier: 'GIG Logistics',
      address: '14 Adeola Odeku Street, Victoria Island, Lagos',
      deliveryEstimateLabel: '2 - 5 days',
      recipientName: 'Ada Okonkwo',
      recipientPhone: '+234 802 111 2233',
    },
    orderStatusLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
  },

  'payment-receipt': {
    ...orderBase,
    amount: 59300,
    paymentMethod: 'Card ending 4242',
    paymentReference: 'PSK_7f3a91bc22',
    paidAt: EARLIER,
    orderStatusLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
  },

  'payment-failed': {
    ...orderBase,
    amount: 59300,
    paymentMethod: 'Card ending 4242',
    reason: 'Insufficient funds',
    retryPaymentLink: 'https://www.rawura.com/checkout?order=66b0f2c9a41d3e0012ab77f4',
    expiresInMinutes: 25,
  },

  'order-shipped': {
    ...orderBase,
    trackingNumber: 'GIG-884201773',
    orderStatus: 'Shipped',
    deliveryType: 'gig',
    gigWaybill: 'WB-2026-884201',
    products: [bucket, chair, crate],
    shipping: {
      courier: 'GIG Logistics',
      address: '14 Adeola Odeku Street, Victoria Island, Lagos',
      deliveryEstimateLabel: '2 - 5 days',
    },
    manageOrderLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
    trackingLink: 'https://www.rawura.com/order-tracking?order=66b0f2c9a41d3e0012ab77f4',
  },

  'order-delivered': {
    ...orderBase,
    deliveredAt: NOW,
    courierName: 'GIG Logistics',
    trackingNumber: 'GIG-884201773',
    deliveryAddress: '14 Adeola Odeku Street, Victoria Island, Lagos',
    products: [bucket, chair, crate],
    viewOrderLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
    returnWindowDays: 7,
    startReturnLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4?tab=returns',
  },

  'delivery-failed': {
    ...orderBase,
    trackingNumber: 'GIG-884201773',
    courierName: 'GIG Logistics',
    deliveryAddress: '14 Adeola Odeku Street, Victoria Island, Lagos',
    reason: 'Nobody available at the address',
    manageOrderLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
    supportLink: 'https://www.rawura.com/pages/contact-us',
  },

  'order-cancelled': {
    ...orderBase,
    cancelledAt: NOW,
    reason: 'Requested by customer',
    products: [bucket, chair],
    refundAmount: 56600,
    refundEtaDays: 7,
    shopLink: 'https://www.rawura.com/shop',
  },

  'return-requested': {
    ...orderBase,
    returnId: '66c1a3d0b52e4f0013cd88a1',
    returnNumber: 'RT-2608-00092',
    returnType: 'refund',
    reason: 'Item arrived cracked',
    requestedAt: NOW,
    items: [bucket],
    estimatedRefund: 25000,
    viewReturnLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4?tab=returns',
  },

  'return-status': {
    ...orderBase,
    returnId: '66c1a3d0b52e4f0013cd88a1',
    returnNumber: 'RT-2608-00092',
    returnType: 'refund',
    status: 'approved',
    updatedAt: NOW,
    items: [bucket],
    adminNotes: 'Approved on photo evidence. No need to return the damaged lid.',
    refundAmount: 25000,
    returnAddress: 'Rawura Returns, 7 Kudirat Abiola Way, Oregun, Ikeja, Lagos',
    returnInstructions: 'Pack the item in its original box and include the packing slip.',
    viewReturnLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4?tab=returns',
  },

  'order-refunded': {
    ...orderBase,
    returnId: '66c1a3d0b52e4f0013cd88a1',
    returnNumber: 'RT-2608-00092',
    returnedProducts: [bucket],
    refundAmount: 25000,
    refundMethod: 'Original payment method (card ending 4242)',
    refundReference: 'RFD_2a91f7cc10',
    refundedAt: NOW,
    refundEtaDays: 7,
    checkRefundLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4?tab=returns',
  },

  rating: {
    ...orderBase,
    products: withReviewLinks([bucket, chair]),
    viewOrderLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f4',
  },

  'abandoned-cart': {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    cartItems: [bucket, chair],
    cartTotal: 56600,
    cartLink: 'https://www.rawura.com/cart',
  },

  coupon: {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    discount: 15,
    couponCode: 'RAWURA15',
    expiryDate: new Date('2026-09-30T23:59:00Z'),
    productCount: 128,
    minimumSpend: 20000,
    useCouponLink: 'https://www.rawura.com/shop',
  },

  wishlist: {
    email: 'ada.okonkwo@example.com',
    firstName: 'Ada',
    products: [chair],
    viewWishlistLink: 'https://www.rawura.com/my-account?tab=wishlist',
  },
};

/**
 * Extra renders for cases that previously slipped through: every optional field absent, the
 * pickup branch, a long basket, and the return statuses that carry different copy.
 */
export const variants: Array<{ name: string; kind: EmailKind; data: EmailPayloadMap[EmailKind] }> = [
  {
    name: 'order-confirmation--pickup',
    kind: 'order-confirmation',
    data: {
      ...fixtures['order-confirmation'],
      deliveryType: 'pickup',
      shipping: {
        courier: 'Pickup',
        address: 'Rawura Store, 7 Kudirat Abiola Way, Oregun, Ikeja, Lagos',
        pickupAddress: 'Rawura Store, 7 Kudirat Abiola Way, Oregun, Ikeja, Lagos',
        pickupContactName: 'Store Front Desk',
        pickupContactPhone: '+234 809 555 0110',
      },
      payment: { ...fixtures['order-confirmation'].payment, shipping: 0, discount: 0 },
    },
  },
  {
    name: 'order-confirmation--minimal',
    kind: 'order-confirmation',
    data: {
      email: 'no.name@example.com',
      orderNumber: 'RW-2608-00418',
      orderId: '66b0f2c9a41d3e0012ab77f5',
      purchaseDate: EARLIER,
      deliveryType: 'shipping',
      products: [{ name: 'Single Item', imagePath: '', price: 1000, quantity: 1, subtotal: 1000 }],
      payment: { totalShopping: 1000, shipping: 0, tax: 0, discount: 0, subtotal: 1000 },
      shipping: { courier: '', address: '' },
      orderStatusLink: 'https://www.rawura.com/my-account/orders/66b0f2c9a41d3e0012ab77f5',
    },
  },
  {
    name: 'order-confirmation--large-basket',
    kind: 'order-confirmation',
    data: {
      ...fixtures['order-confirmation'],
      products: Array.from({ length: 20 }, (_, i) => ({
        ...bucket,
        name: `Bulk Line Item ${i + 1} — Long Product Name That Should Wrap On A Phone`,
        quantity: i + 1,
        subtotal: 12500 * (i + 1),
      })),
    },
  },
  {
    name: 'order-shipped--no-tracking-link',
    kind: 'order-shipped',
    data: {
      ...fixtures['order-shipped'],
      deliveryType: 'shipping',
      gigWaybill: undefined,
      trackingLink: undefined,
      products: [],
    },
  },
  {
    name: 'order-cancelled--unpaid',
    kind: 'order-cancelled',
    data: { ...fixtures['order-cancelled'], refundAmount: undefined, refundEtaDays: undefined, reason: undefined },
  },
  {
    name: 'return-status--rejected',
    kind: 'return-status',
    data: {
      ...fixtures['return-status'],
      status: 'rejected',
      adminNotes: 'The return window for this order closed on 12 July 2026.',
      refundAmount: undefined,
      returnAddress: undefined,
      returnInstructions: undefined,
    },
  },
  {
    name: 'return-status--items-received',
    kind: 'return-status',
    data: {
      ...fixtures['return-status'],
      status: 'items_received',
      adminNotes: undefined,
      returnAddress: undefined,
      returnInstructions: undefined,
    },
  },
  {
    name: 'return-status--inspection-failed',
    kind: 'return-status',
    data: {
      ...fixtures['return-status'],
      status: 'inspection_failed',
      adminNotes: 'The item shows signs of use beyond inspection and cannot be resold.',
      returnAddress: undefined,
      returnInstructions: undefined,
    },
  },
  {
    name: 'wishlist--multiple',
    kind: 'wishlist',
    data: { ...fixtures.wishlist, products: [chair, bucket, crate] },
  },
  {
    name: 'rating--single-product',
    kind: 'rating',
    data: { ...fixtures.rating, products: withReviewLinks([bucket]) },
  },
] as Array<{ name: string; kind: EmailKind; data: EmailPayloadMap[EmailKind] }>;
