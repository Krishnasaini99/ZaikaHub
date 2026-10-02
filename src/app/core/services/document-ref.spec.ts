import { Injector, runInInjectionContext } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { initializeApp } from 'firebase/app';
import { collection, doc, getFirestore } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ESM module namespaces are frozen, so the write functions must be replaced via
 * a module mock rather than `vi.spyOn`. The services import from
 * `@angular/fire/firestore`, so that is the module to mock; `doc`/`collection`
 * stay the real SDK, which is what makes the assertions meaningful.
 *
 * Stubbing the writes also keeps the suite offline — without it Firestore tries
 * to reach the `zaika-hub-test` project and the tests hang on permissions.
 */
vi.mock('@angular/fire/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/fire/firestore')>();
  return {
    ...actual,
    setDoc: vi.fn((ref: { path: string }) => {
      capture.path = ref.path;
      return Promise.resolve();
    }),
    writeBatch: vi.fn(() => ({
      set: (ref: { path: string }) => {
        capture.path = ref.path;
      },
      commit: () => Promise.resolve(),
    })),
  };
});

const capture = { path: null as string | null };

import { OrderService } from './order.service';
import { RestaurantService } from './restaurant.service';
import { UserService } from './user.service';
import type { CartItem } from '../models/order.model';

/**
 * Regression guard for a real, shipped bug: passing a *collection path* to
 * `doc()` instead of a collection reference.
 *
 * `doc(firestore, 'orders')` builds a reference with an odd number of path
 * segments. Firestore only rejects that at write time, so every fully-stubbed
 * service test stayed green while the live app threw
 * `Invalid document reference...` the first time a customer placed an order,
 * and again for every restaurant and menu item creation.
 *
 * The point of this suite is that it exercises the **actual write methods**
 * (`placeOrder`, `createRestaurant`, `createMenuItems`) rather than
 * re-deriving the references in the test. An earlier version of this file
 * asserted on `doc(collection(...))` directly and therefore passed even with
 * the bug reintroduced — it tested the SDK, not the service.
 *
 * `setDoc`/`writeBatch` are stubbed so no network call happens; what is
 * asserted is the reference the service handed to them.
 */
const app = initializeApp({ projectId: 'zaika-hub-test', apiKey: 'test', appId: 'test' });
const firestore = getFirestore(app);

const injector = Injector.create({
  providers: [{ provide: Firestore, useValue: firestore }, RestaurantService, OrderService, UserService],
});

function build<T>(token: new (...args: never[]) => T): T {
  return runInInjectionContext(injector, () => injector.get(token) as T);
}

const cartItem: CartItem = {
  menuItemId: 'dish-1',
  restaurantId: 'rest-1',
  restaurantName: 'Zaika House',
  name: 'Hyderabadi Chicken Biryani',
  price: 320,
  quantity: 1,
  isVeg: false,
  imageUrl: null,
};

const address = {
  label: 'Home',
  contactName: 'Aarav Sharma',
  contactPhone: '9876543210',
  line1: 'Flat 402',
  line2: '4th Block',
  city: 'Bengaluru',
  pincode: '560034',
};

beforeEach(() => {
  capture.path = null;
});

afterEach(() => {
  capture.path = null;
});

describe('write paths are valid Firestore document references', () => {
  it('placeOrder builds an order reference with an even number of path segments', async () => {
    const service = build(OrderService);

    await service.placeOrder({
      userId: 'user-1',
      restaurantId: 'rest-1',
      restaurantName: 'Zaika House',
      restaurantCoverImageUrl: null,
      items: [cartItem],
      address,
      paymentMethod: 'cod',
    });

    expect(capture.path).not.toBeNull();
    expect(capture.path!.split('/').length % 2).toBe(0);
    expect(capture.path!.startsWith('orders/')).toBe(true);
  });

  it('createRestaurant builds a restaurant reference with an even segment count', async () => {
    const service = build(RestaurantService);

    await service.createRestaurant('owner-1', {
      name: 'Zaika House',
      cuisines: ['Biryani'],
      priceBand: 'mid',
      costForTwo: 600,
      deliveryTimeMinutes: 32,
      city: 'Bengaluru',
      area: 'Koramangala',
      address: '80 Feet Road',
      modes: ['delivery'],
      openingHours: { open: 570, close: 1380 },
      coverImageUrl: null,
      logoImageUrl: null,
    });

    expect(capture.path).not.toBeNull();
    expect(capture.path!.split('/').length % 2).toBe(0);
    expect(capture.path!.startsWith('restaurants/')).toBe(true);
  });

  it('addMenuItems builds a menu item reference with an even segment count', async () => {
    const service = build(RestaurantService);

    await service.addMenuItems('rest-1', [
      {
        name: 'Butter Naan',
        description: 'Soft, brushed with butter.',
        price: 60,
        imageUrl: null,
        category: 'Breads',
        isVeg: true,
      },
    ]);

    expect(capture.path).not.toBeNull();
    expect(capture.path!.split('/').length % 2).toBe(0);
    expect(capture.path!.startsWith('restaurants/rest-1/menuItems/')).toBe(true);
  });

  it('a bare collection path is rejected by Firestore, which is the bug being guarded', () => {
    // Documents *why* the assertions above matter: this throws, which is exactly
    // what the live app showed before the fix.
    expect(() => doc(firestore, 'orders')).toThrowError(/Invalid document reference/);
    expect(() => doc(collection(firestore, 'orders'))).not.toThrow();
  });
});