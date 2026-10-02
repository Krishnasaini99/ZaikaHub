/**
 * Order status rules, as pure functions.
 *
 * Kept free of any Firebase import so the state machine can be unit-tested
 * without a TestBed, and reused by the service, the owner panel and the
 * customer history without duplicating the transition table.
 */
import { OrderStatus } from '../models/order.model';

/** The order lifecycle, in the only order statuses may advance. */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  'placed',
  'accepted',
  'preparing',
  'out_for_delivery',
  'delivered',
];

/** Statuses an owner or admin may set from the restaurant panel. */
export const OWNER_SETTABLE_STATUSES: readonly OrderStatus[] = [
  'accepted',
  'preparing',
  'out_for_delivery',
  'delivered',
];

/** Delivered and cancelled orders are the two terminal states. */
export function isTerminal(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

/** Only a freshly placed order can still be cancelled. */
export function isCancellable(status: OrderStatus | null): boolean {
  return status === 'placed';
}

/**
 * The single next status, or `null` when the order has reached the end.
 *
 * Returning only the *next* status is what stops a UI dropdown from jumping
 * an order from `placed` straight to `delivered`.
 */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(status);
  if (index < 0 || index === ORDER_STATUS_FLOW.length - 1) {
    return null;
  }
  return ORDER_STATUS_FLOW[index + 1];
}
