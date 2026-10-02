import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { PriceBand, RatingTier } from '../../core/models/restaurant.model';
import { ratingTierFor, ratingTierLabel } from '../../core/utils/format.util';

/**
 * Zomato's rating pill: a coloured block showing the score plus its tier word.
 * Restaurants with no reviews yet render as "New".
 */
@Component({
  selector: 'app-rating-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @if (tier(); as activeTier) {
      <span class="rating" [class]="'rating--' + activeTier" [attr.title]="tooltip()">
        <span class="rating__score">{{ rating() | number: '1.1-1' }}</span>
        <span class="rating__label">{{ tierLabel() }}</span>
      </span>
    } @else {
      <span class="rating rating--new" title="No reviews yet">
        <span class="rating__label">New</span>
      </span>
    }
  `,
  styles: `
    .rating {
      display: inline-flex;
      align-items: baseline;
      gap: 0.3rem;
      padding: 0.2rem 0.45rem;
      border-radius: var(--radius-sm);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }

    .rating__score {
      font-size: 13px;
    }

    .rating--excellent,
    .rating--great {
      background: var(--color-rating-excellent);
    }

    .rating--good {
      background: var(--color-rating-good);
    }

    .rating--new {
      background: var(--color-text-subtle);
    }
  `,
})
export class RatingBadgeComponent {
  /** Numeric rating, 0–5. */
  readonly rating = input.required<number>();

  /** Review count, surfaced only as a tooltip. */
  readonly ratingCount = input<number>(0);

  protected readonly tier = computed<RatingTier | null>(() => ratingTierFor(this.rating()));
  protected readonly tierLabel = computed(() => ratingTierLabel(this.tier()));
  protected readonly tooltip = computed(() =>
    this.ratingCount() > 0
      ? `${this.ratingCount()} rating${this.ratingCount() === 1 ? '' : 's'}`
      : 'No ratings yet',
  );
}
