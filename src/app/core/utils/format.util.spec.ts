import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  formatMinutesSinceMidnight,
  formatOpeningHours,
  ratingTierFor,
  ratingTierLabel,
  summariseList,
} from './format.util';

describe('ratingTierFor', () => {
  it('maps 4.5 and above to excellent', () => {
    expect(ratingTierFor(4.5)).toBe('excellent');
    expect(ratingTierFor(5)).toBe('excellent');
  });

  it('maps 4.0–4.49 to great', () => {
    expect(ratingTierFor(4.4)).toBe('great');
  });

  it('maps 3.5–3.99 to good', () => {
    expect(ratingTierFor(3.5)).toBe('good');
  });

  it('returns null below the listing threshold', () => {
    expect(ratingTierFor(3.49)).toBeNull();
    expect(ratingTierFor(0)).toBeNull();
  });
});

describe('ratingTierLabel', () => {
  it('falls back to "New" when there is no tier', () => {
    expect(ratingTierLabel(null)).toBe('New');
  });
});

describe('formatDuration', () => {
  it('shows plain minutes below an hour', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  it('drops the minute part on a whole hour', () => {
    expect(formatDuration(120)).toBe('2 hr');
  });

  it('includes both parts for a mixed duration', () => {
    expect(formatDuration(65)).toBe('1 hr 5 min');
  });
});

describe('formatMinutesSinceMidnight', () => {
  it('converts minutes to a clock label', () => {
    expect(formatMinutesSinceMidnight(570)).toBe('9:30 am');
    expect(formatMinutesSinceMidnight(1380)).toBe('11:00 pm');
  });

  it('wraps values outside a single day', () => {
    expect(formatMinutesSinceMidnight(1440 + 570)).toBe('9:30 am');
  });
});

describe('formatOpeningHours', () => {
  it('renders both ends of the window', () => {
    expect(formatOpeningHours({ open: 570, close: 1380 })).toBe('9:30 am – 11:00 pm');
  });

  it('reports a zero-length window as closed', () => {
    expect(formatOpeningHours({ open: 600, close: 600 })).toBe('Closed');
  });
});

describe('summariseList', () => {
  it('joins a short list in full', () => {
    expect(summariseList(['Pizza', 'Burger'], 3)).toBe('Pizza, Burger');
  });

  it('appends a count once the list is truncated', () => {
    expect(summariseList(['a', 'b', 'c', 'd', 'e'], 3)).toBe('a, b, c +2 more');
  });
});
