import { describe, expect, it } from 'vitest';

import type { HighlightDish } from '../models/restaurant.model';
import { advance, shouldRotate, show, toSlide, toSlides } from './hero-showcase.util';

/**
 * These tests import the real functions the component uses — not re-implementations.
 * That distinction matters: an earlier version of this suite copied the logic into
 * the spec, so it would have passed even with the component broken.
 */

function dish(overrides: Partial<HighlightDish> = {}): HighlightDish {
  return {
    id: 'dish-1',
    restaurantId: 'rest-1',
    restaurantName: 'Zaika House',
    menuItemId: 'menu-1',
    name: 'Hyderabadi Chicken Biryani',
    description: 'Dum-cooked basmati rice.',
    price: 320,
    imageUrl: 'https://cdn/dish.jpg',
    isVeg: false,
    rank: 0,
    imageCredit: null,
    ...overrides,
  };
}

describe('toSlides', () => {
  it('keeps dishes that have a photo', () => {
    const slides = toSlides([dish({ id: 'a' }), dish({ id: 'b' }), dish({ id: 'c' })]);

    expect(slides).toHaveLength(3);
  });

  // A gap would render as an empty frame for the five seconds the timer holds it.
  it('drops dishes with no photo', () => {
    const slides = toSlides([dish({ id: 'a' }), dish({ id: 'b', imageUrl: null })]);

    expect(slides.map((d) => d.id)).toEqual(['a']);
  });

  it('returns an empty list when nothing has a photo, so the banner is not rendered', () => {
    expect(toSlides([dish({ imageUrl: null }), dish({ imageUrl: null })])).toHaveLength(0);
  });

  it('treats an empty string as no photo', () => {
    // Firestore can hold `""` where a null was intended; it would render as a
    // broken image rather than falling through to the placeholder.
    expect(toSlide(dish({ imageUrl: '' }))).toBe(false);
  });
});

describe('advance', () => {
  it('moves to the next slide', () => {
    expect(advance(0, 3)).toBe(1);
    expect(advance(1, 3)).toBe(2);
  });

  // This is the whole point of the banner: it must never run out.
  it('wraps from the last slide back to the first', () => {
    expect(advance(2, 3)).toBe(0);
  });

  it('completes a full loop and returns to the starting slide', () => {
    let index = 0;
    for (let i = 0; i < 3; i += 1) {
      index = advance(index, 3);
    }

    expect(index).toBe(0);
  });

  it('stays on the only slide when there is just one', () => {
    expect(advance(0, 1)).toBe(0);
  });

  it('does not move when there is nothing to show', () => {
    expect(advance(0, 0)).toBe(0);
  });
});

describe('show', () => {
  it('accepts an index inside the list', () => {
    expect(show(0, 3)).toBe(0);
    expect(show(2, 3)).toBe(2);
  });

  // Returning null makes the caller do nothing, which is better than silently
  // showing a dish other than the one whose dot was clicked.
  it('refuses an index past the end instead of clamping', () => {
    expect(show(3, 3)).toBeNull();
    expect(show(99, 3)).toBeNull();
  });

  it('refuses a negative index', () => {
    expect(show(-1, 3)).toBeNull();
  });

  it('refuses everything when the banner is empty', () => {
    expect(show(0, 0)).toBeNull();
  });
});

describe('shouldRotate', () => {
  it('rotates only when there is more than one slide', () => {
    expect(shouldRotate(2)).toBe(true);
    expect(shouldRotate(1)).toBe(false);
    expect(shouldRotate(0)).toBe(false);
  });
});
