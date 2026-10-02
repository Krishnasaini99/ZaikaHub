import { describe, expect, it } from 'vitest';

import {
  isCancellable,
  isTerminal,
  nextStatus,
  ORDER_STATUS_FLOW,
} from './order-status.util';
import { OrderStatus } from '../models/order.model';

describe('nextStatus', () => {
  it('walks the lifecycle one step at a time', () => {
    expect(nextStatus('placed')).toBe('accepted');
    expect(nextStatus('accepted')).toBe('preparing');
    expect(nextStatus('preparing')).toBe('out_for_delivery');
    expect(nextStatus('out_for_delivery')).toBe('delivered');
  });

  it('returns null at the end of the lifecycle', () => {
    expect(nextStatus('delivered')).toBeNull();
  });

  it('returns null for a status outside the flow', () => {
    expect(nextStatus('cancelled')).toBeNull();
  });

  it('never leaves the declared flow', () => {
    for (const status of ORDER_STATUS_FLOW) {
      const next = nextStatus(status);
      expect(next === null || ORDER_STATUS_FLOW.includes(next)).toBe(true);
    }
  });
});

describe('isTerminal', () => {
  it('treats delivered and cancelled as terminal', () => {
    expect(isTerminal('delivered')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('treats in-flight statuses as non-terminal', () => {
    const inFlight: OrderStatus[] = ['placed', 'accepted', 'preparing', 'out_for_delivery'];
    for (const status of inFlight) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

describe('isCancellable', () => {
  it('only allows cancelling a freshly placed order', () => {
    expect(isCancellable('placed')).toBe(true);
    expect(isCancellable('accepted')).toBe(false);
    expect(isCancellable(null)).toBe(false);
  });
});
