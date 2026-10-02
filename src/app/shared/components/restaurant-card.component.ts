import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RestaurantSummary } from '../../core/models/restaurant.model';
import { DurationPipe, ListSummaryPipe } from '../../core/pipes/display.pipes';
import { PriceBandComponent } from './price-band.component';
import { RatingBadgeComponent } from './rating-badge.component';

/** Restaurant card used on the home grid, the featured strip and search results. */
@Component({
  selector: 'app-restaurant-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RatingBadgeComponent, PriceBandComponent, DurationPipe, ListSummaryPipe],
  templateUrl: './restaurant-card.component.html',
  styleUrl: './restaurant-card.component.scss',
})
export class RestaurantCardComponent {
  readonly restaurant = input.required<RestaurantSummary>();
  readonly selected = input(false);

  readonly open = output<RestaurantSummary>();

  protected readonly cuisines = computed(() => this.restaurant().cuisines);
}
