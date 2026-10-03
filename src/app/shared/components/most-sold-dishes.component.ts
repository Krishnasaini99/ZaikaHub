import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { MenuItem } from '../../core/models/restaurant.model';
import type { TopDish } from '../../core/utils/dish-sales.util';
import { VegMarkerComponent } from './veg-marker.component';

/**
 * The three "most ordered" rows under a home-page restaurant card.
 *
 * Compact on purpose: photo, name, price, the sold count and an Add control.
 * No description, no credit line — at a 48px thumbnail both would be
 * illegible, and both live one click away on the detail page these rows link
 * to (the photo credit for CC BY images renders on the full menu row there).
 *
 * Fully controlled like `MenuItemRowComponent`: quantities come in, changes
 * go out, and the cart stays the single owner of state. The Add/stepper pair
 * behaves exactly like the menu row's — quantity 0 renders Add, anything else
 * renders the stepper — so the site never teaches two gestures for one job.
 */
@Component({
  selector: 'app-most-sold-dishes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, RouterLink, VegMarkerComponent],
  templateUrl: './most-sold-dishes.component.html',
  styleUrl: './most-sold-dishes.component.scss',
})
export class MostSoldDishesComponent {
  readonly restaurantId = input.required<string>();
  readonly restaurantName = input.required<string>();
  readonly rows = input.required<readonly TopDish[]>();

  /** Current cart quantity per dish; a missing key means zero. */
  readonly quantities = input<Readonly<Record<string, number>>>({});

  readonly quantityChange = output<{ item: MenuItem; quantity: number }>();

  protected quantityFor(menuItemId: string): number {
    return this.quantities()[menuItemId] ?? 0;
  }

  protected add(item: MenuItem): void {
    this.quantityChange.emit({ item, quantity: this.quantityFor(item.id) + 1 });
  }

  protected decrement(item: MenuItem): void {
    this.quantityChange.emit({ item, quantity: this.quantityFor(item.id) - 1 });
  }
}
