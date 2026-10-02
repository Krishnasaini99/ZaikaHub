import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PriceBand } from '../../core/models/restaurant.model';

const SYMBOLS: Record<PriceBand, string> = {
  budget: '₹',
  mid: '₹₹',
  premium: '₹₹₹',
};

/** Price tier indicator: ₹ / ₹₹ / ₹₹₹. */
@Component({
  selector: 'app-price-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="band">{{ symbols() }}</span>`,
  styles: `
    .band {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text);
    }
  `,
})
export class PriceBandComponent {
  readonly band = input.required<PriceBand>();

  protected readonly symbols = computed(() => SYMBOLS[this.band()]);
}
