import type { HighlightDish } from '../models/restaurant.model';

/**
 * Decision logic for the hero banner, kept out of the component.
 *
 * This is here so it can be tested directly. The component owns the *timer* and
 * the DOM; everything that decides **which** dish is on screen is a pure function
 * of its inputs, and pure functions are cheap to assert.
 *
 * The alternative — testing copies of these functions written out again in a
 * spec — proves nothing. An earlier version of this suite did exactly that and
 * would have passed even if the component had been broken.
 */

/** A dish is only usable as a slide if it actually has a photo. */
export function toSlide(dish: HighlightDish): dish is HighlightDish {
  return Boolean(dish.imageUrl);
}

/**
 * The dishes that can be shown.
 *
 * Filtering happens here rather than in a template loop so that `advance()` and
 * the dot buttons can both reason about the same count. If the template skipped
 * the gaps itself, the two would disagree and the banner would land on an empty
 * slide every N ticks.
 */
export function toSlides(dishes: readonly HighlightDish[]): readonly HighlightDish[] {
  return dishes.filter(toSlide);
}

/**
 * Next slide, wrapping.
 *
 * Wrapping is what makes the banner loop rather than stop at the end.
 * A single-slide list stays on that slide instead of cycling to nothing.
 */
export function advance(index: number, total: number): number {
  if (total <= 0) {
    return index;
  }
  return (index + 1) % total;
}

/**
 * Jumps to a specific slide, from a click on one of the dots.
 *
 * Returns `null` for an out-of-range request rather than clamping. The caller
 * treats `null` as "do nothing", which is safer than silently showing a different
 * dish than the one whose dot was clicked.
 */
export function show(requested: number, total: number): number | null {
  if (requested < 0 || requested >= total) {
    return null;
  }
  return requested;
}

/** Whether the banner has more than one thing to show. */
export function shouldRotate(total: number): boolean {
  return total > 1;
}
