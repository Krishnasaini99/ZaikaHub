import { OpeningHours } from '../models/restaurant.model';

/**
 * Pure display formatting helpers.
 *
 * These contain no Angular dependencies, so they stay trivially unit-testable
 * and can be reused from pipes, components or a Node script. The Angular pipes
 * that wrap them live in `../pipes/display.pipes.ts`.
 */

/** Indian price tiers, matching the ₹ symbol count shown on Zomato cards. */
export const PRICE_BAND_SYMBOLS = {
  budget: '₹',
  mid: '₹₹',
  premium: '₹₹₹',
} as const;

/** 4.5+ / 4.0+ / 3.5+ → tier. Below 3.5 the restaurant is not listed. */
export function ratingTierFor(rating: number): 'excellent' | 'great' | 'good' | null {
  if (rating >= 4.5) return 'excellent';
  if (rating >= 4.0) return 'great';
  if (rating >= 3.5) return 'good';
  return null;
}

/** Colour token / word shown next to the rating score. */
export function ratingTierLabel(tier: 'excellent' | 'great' | 'good' | null): string {
  switch (tier) {
    case 'excellent':
      return 'Excellent';
    case 'great':
      return 'Great';
    case 'good':
      return 'Good';
    default:
      return 'New';
  }
}

/** "36 min" / "1 hr 5 min" for delivery estimates. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** "9:30 am" from minutes-since-midnight. */
export function formatMinutesSinceMidnight(minutes: number): string {
  const normalised = ((minutes % 1440) + 1440) % 1440;
  const date = new Date(2000, 0, 1, Math.floor(normalised / 60), normalised % 60);
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "9:30 am – 11:00 pm", with "Closed" for a zero-length window. */
export function formatOpeningHours(hours: OpeningHours): string {
  if (hours.open === hours.close) {
    return 'Closed';
  }
  return `${formatMinutesSinceMidnight(hours.open)} – ${formatMinutesSinceMidnight(hours.close)}`;
}

/** Comma-joined list capped at `max` entries, with "+N more" appended. */
export function summariseList(values: readonly string[], max = 3): string {
  if (values.length <= max) {
    return values.join(', ');
  }
  return `${values.slice(0, max).join(', ')} +${values.length - max} more`;
}
