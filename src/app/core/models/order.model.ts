/** Line item as stored inside an order document. */
export interface OrderItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
  /** `price * quantity`, denormalised so order history never needs a re-read. */
  readonly lineTotal: number;
  readonly isVeg: boolean;
}

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'cod' | 'card' | 'upi';

/** Snapshot of the delivery address, copied so the order stays immutable. */
export interface OrderAddress {
  readonly label: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly pincode: string;
}

export interface OrderTotals {
  readonly itemTotal: number;
  readonly deliveryFee: number;
  readonly taxes: number;
  readonly discount: number;
  readonly grandTotal: number;
}

/** Firestore shape of `orders/{orderId}`. */
export interface Order {
  readonly id: string;
  readonly userId: string;
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly restaurantCoverImageUrl: string | null;
  readonly items: readonly OrderItem[];
  readonly address: OrderAddress;
  readonly totals: OrderTotals;
  readonly status: OrderStatus;
  readonly paymentMethod: PaymentMethod;
  readonly placedAt: Date;
  readonly updatedAt: Date;
  /** Populated once the restaurant accepts the order. */
  readonly etaMinutes: number | null;
  readonly cancelledReason: string | null;
}

/** A cart line kept only in memory/localStorage until checkout. */
export interface CartItem {
  readonly menuItemId: string;
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly name: string;
  readonly price: number;
  readonly isVeg: boolean;
  readonly imageUrl: string | null;
  readonly quantity: number;
}

export interface CartTotals {
  readonly itemCount: number;
  readonly itemTotal: number;
  readonly deliveryFee: number;
  readonly taxes: number;
  readonly discount: number;
  readonly grandTotal: number;
}
