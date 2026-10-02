import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { OpeningHours, PriceBand, RatingTier } from '../models/restaurant.model';
import { formatClock, formatDateTime, timeAgo } from '../utils/date.util';
import {
  formatDuration,
  formatOpeningHours,
  ratingTierFor,
  summariseList,
} from '../utils/format.util';

/**
 * Angular pipes wrapping the pure helpers in `core/utils`.
 *
 * Keeping the logic out of the pipe classes is what makes them unit-testable
 * without a TestBed, and reusable from a Node script.
 */

/** "36 min" / "1 hr 5 min". */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(minutes: number | null | undefined): string {
    return minutes === null || minutes === undefined ? '' : formatDuration(minutes);
  }
}

/** "5 min ago", "3 hr ago", "2 Mar 2026". */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: Date | null | undefined): string {
    return value ? timeAgo(value) : '';
  }
}

/** "Today, 7:10 pm" / "2 Mar 2026, 7:10 pm". */
@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  transform(value: Date | null | undefined): string {
    return value ? formatDateTime(value) : '';
  }
}

/** "7:10 pm". */
@Pipe({ name: 'clock' })
export class ClockPipe implements PipeTransform {
  transform(value: Date | null | undefined): string {
    return value ? formatClock(value) : '';
  }
}

/** "9:30 am – 11:00 pm". */
@Pipe({ name: 'openingHours' })
export class OpeningHoursPipe implements PipeTransform {
  transform(hours: OpeningHours | null | undefined): string {
    return hours ? formatOpeningHours(hours) : '';
  }
}

/** "Pizza, Burger +2 more". */
@Pipe({ name: 'listSummary' })
export class ListSummaryPipe implements PipeTransform {
  transform(values: readonly string[] | null | undefined, max = 3): string {
    return values ? summariseList(values, max) : '';
  }
}

/** 0–5 rating → tier, for `badge--excellent` style classes. */
@Pipe({ name: 'ratingTier' })
export class RatingTierPipe implements PipeTransform {
  transform(rating: number | null | undefined): RatingTier | null {
    return rating === null || rating === undefined ? null : ratingTierFor(rating);
  }
}

/**
 * Indian rupee formatting bound to the runtime's locale data rather than a
 * hard-coded pattern, so it follows `en-IN` numbering (1,23,456).
 *
 * `digits="info"` renders the rounded figure used in a bill summary;
 * the default keeps paise for line items.
 */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  private readonly currency = inject(CurrencyPipe);
  private readonly decimal = inject(DecimalPipe);

  transform(value: number | null | undefined, digits: 'info' | 'precise' = 'precise'): string {
    if (value === null || value === undefined) {
      return '';
    }
    return digits === 'info'
      ? (this.currency.transform(value, 'INR', 'symbol', '1.0-0') ?? '')
      : (this.decimal.transform(value, '1.0-2') ?? '');
  }
}

/** Re-exported so templates can import the union from one place. */
export type { PriceBand, RatingTier } from '../models/restaurant.model';
