import { describe, expect, it } from 'vitest';

import type { MenuItem, Restaurant } from '../models/restaurant.model';
import { breadcrumbJsonLd, restaurantDescription, restaurantJsonLd } from './structured-data.util';

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'zaika-house',
    ownerId: 'owner-1',
    name: 'Zaika House',
    slug: 'zaika-house',
    cuisines: ['North Indian', 'Biryani'],
    priceBand: 'mid',
    rating: 4.5,
    ratingCount: 1284,
    deliveryTimeMinutes: 32,
    costForTwo: 600,
    coverImageUrl: 'https://res.cloudinary.com/x/cover.jpg',
    logoImageUrl: null,
    city: 'Bengaluru',
    area: 'Koramangala',
    address: '80 Feet Road, 4th Block',
    modes: ['delivery'],
    openingHours: { open: 570, close: 1380 },
    featured: true,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function menuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'dish-1',
    restaurantId: 'zaika-house',
    name: 'Hyderabadi Chicken Biryani',
    description: 'Dum-cooked basmati rice.',
    price: 320,
    imageUrl: null,
    category: 'Biryani',
    isVeg: false,
    isAvailable: true,
    rating: null,
    isBestseller: true,
    order: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const URL_UNDER_TEST = 'https://zaika-hub-prod.web.app/restaurant/zaika-house';

describe('restaurantJsonLd', () => {
  it('emits a Restaurant schema with cuisines, price range and address', () => {
    const [schema] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, null);

    expect(schema['@type']).toBe('Restaurant');
    expect(schema['name']).toBe('Zaika House');
    expect(schema['servesCuisine']).toEqual(['North Indian', 'Biryani']);
    expect(schema['priceRange']).toBe('₹₹₹');
    expect(schema['address']).toMatchObject({
      addressLocality: 'Koramangala',
      addressRegion: 'Bengaluru',
      addressCountry: 'IN',
    });
  });

  it('converts minutes-since-midnight to HH:MM opening hours', () => {
    const [schema] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, null);
    const hours = schema['openingHoursSpecification'] as Record<string, unknown>;

    expect(hours['opens']).toBe('09:30');
    expect(hours['closes']).toBe('23:00');
  });

  it('includes an aggregate rating only when both rating and count are real', () => {
    const [rated] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, null);
    expect(rated['aggregateRating']).toMatchObject({
      ratingValue: '4.5',
      reviewCount: 1284,
    });
  });

  // The important one: declaring `aggregateRating` without real reviews is
  // invalid structured data, which Google can act against. A newly published
  // restaurant has rating 0, so it must simply omit the block.
  it('omits aggregateRating for an unrated restaurant', () => {
    const [fresh] = restaurantJsonLd(
      restaurant({ rating: 0, ratingCount: 0 }),
      [],
      URL_UNDER_TEST,
      null,
    );

    expect(fresh).not.toHaveProperty('aggregateRating');
  });

  it('omits aggregateRating when the rating exists but no reviews do', () => {
    const [inconsistent] = restaurantJsonLd(
      restaurant({ rating: 4.5, ratingCount: 0 }),
      [],
      URL_UNDER_TEST,
      null,
    );

    expect(inconsistent).not.toHaveProperty('aggregateRating');
  });

  it('groups the menu into sections by category with INR offers', () => {
    const [schema] = restaurantJsonLd(
      restaurant(),
      [
        menuItem({ id: 'a', name: 'Hyderabadi Chicken Biryani', category: 'Biryani' }),
        menuItem({ id: 'b', name: 'Veg Dum Biryani', category: 'Biryani' }),
        menuItem({ id: 'c', name: 'Butter Naan', category: 'Breads', price: 60 }),
      ],
      URL_UNDER_TEST,
      null,
    );

    const sections = schema['hasMenuSection'] as Record<string, unknown>[];
    expect(sections).toHaveLength(2);

    const biryani = sections.find((s) => s['name'] === 'Biryani')!;
    expect(biryani['hasMenuItem']).toHaveLength(2);

    const naan = sections.find((s) => s['name'] === 'Breads')!;
    expect((naan['hasMenuItem'] as Record<string, unknown>[])[0]['offers']).toEqual({
      '@type': 'Offer',
      price: '60.00',
      priceCurrency: 'INR',
    });
  });

  it('omits hasMenuSection when the menu is empty', () => {
    const [schema] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, null);
    expect(schema).not.toHaveProperty('hasMenuSection');
  });

  it('prefers the cover image and falls back to nothing when absent', () => {
    const [withCover] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, 'https://cdn/cover.jpg');
    expect(withCover['image']).toBe('https://cdn/cover.jpg');

    const [withoutCover] = restaurantJsonLd(restaurant(), [], URL_UNDER_TEST, null);
    expect(withoutCover['image']).toBeUndefined();
  });
});

describe('restaurantDescription', () => {
  it('stays within the length search engines actually render', () => {
    // Deliberately a long name and a long dish name — the two things most likely
    // to blow the budget in real data.
    const description = restaurantDescription(
      restaurant({
        name: 'The Grand Maharaja Palace Biryani House',
        area: 'Koramangala',
        rating: 4.8,
        ratingCount: 12483,
      }),
      [
        menuItem({ name: 'Hyderabadi Dum Chicken Biryani With Fried Onions' }),
        menuItem({ id: 'b', name: 'Gulab Jamun' }),
      ],
    );

    expect(description.length).toBeLessThanOrEqual(155);
  });

  it('leads with the restaurant and its area', () => {
    const description = restaurantDescription(restaurant(), [menuItem()]);

    expect(description.startsWith('Order food online from Zaika House, Koramangala.')).toBe(true);
  });

  it('includes the rating and delivery time when there is room', () => {
    const description = restaurantDescription(restaurant(), [menuItem()]);

    expect(description).toContain('Rated 4.5 by 1284 diners.');
    expect(description).toContain('32 min delivery.');
  });

  it('omits the rating for an unrated restaurant rather than claiming zero', () => {
    const description = restaurantDescription(
      restaurant({ rating: 0, ratingCount: 0 }),
      [menuItem()],
    );

    expect(description).not.toContain('Rated');
    expect(description).not.toContain('0');
  });

  // Dish names are what let a page match a search for the food itself, so at
  // least one is worth sacrificing a rating clause for if only one will fit.
  it('falls back to a dish name when the rating clause would not fit', () => {
    const description = restaurantDescription(
      restaurant({ name: 'A Restaurant With A Rather Long Name Indeed', area: 'HSR Layout' }),
      [menuItem({ name: 'Butter Naan' })],
    );

    expect(description).toContain('Try Butter Naan.');
  });

  it('drops whole clauses rather than cutting mid-word', () => {
    const description = restaurantDescription(
      restaurant(),
      [
        menuItem({ name: 'Hyderabadi Chicken Biryani' }),
        menuItem({ id: 'b', name: 'Paneer Tikka Masala' }),
        menuItem({ id: 'c', name: 'Butter Naan' }),
      ],
    );

    expect(description.endsWith('.')).toBe(true);
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it('still produces something usable with no menu at all', () => {
    const description = restaurantDescription(restaurant(), []);

    expect(description).toContain('Zaika House');
    expect(description.length).toBeLessThanOrEqual(155);
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers items from one and links only the deepest crumb', () => {
    const [schema] = breadcrumbJsonLd(URL_UNDER_TEST, [
      { name: 'ZaikaHub', path: '/' },
      { name: 'Restaurants', path: '/restaurants' },
      { name: 'Zaika House', path: '/restaurant/zaika-house' },
    ]);

    const items = schema['itemListElement'] as Record<string, unknown>[];
    expect(items.map((i) => i['position'])).toEqual([1, 2, 3]);
    expect(items[0]['item']).toBeNull();
    expect(items[2]['item']).toBe(URL_UNDER_TEST);
  });

  it('returns nothing for an empty trail', () => {
    expect(breadcrumbJsonLd(URL_UNDER_TEST, [])).toEqual([]);
  });
});