import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

import { MenuItem } from '../../core/models/restaurant.model';
import { ImageCreditComponent } from './image-credit.component';
import { VegMarkerComponent } from './veg-marker.component';

/**
 * A single menu row: veg marker, name, description, price and quantity stepper.
 *
 * Purely presentational and fully controlled — quantity changes are emitted,
 * never applied internally. That keeps the cart the single owner of state.
 */
@Component({
  selector: 'app-menu-item-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Anchor id for `?item=` deep links: the restaurant page looks this up to
  // scroll straight to the dish the visitor tapped on the home page.
  host: { '[attr.id]': "'menu-item-' + item().id" },
  imports: [CurrencyPipe, VegMarkerComponent, ImageCreditComponent],
  templateUrl: './menu-item-row.component.html',
  styleUrl: './menu-item-row.component.scss',
})
export class MenuItemRowComponent {
  readonly item = input.required<MenuItem>();
  /** Current cart quantity for this item; `0` renders the "Add" button. */
  readonly quantity = input<number>(0);
  /** Disables the stepper while an upload or save is in flight. */
  readonly busy = input(false);
  /**
   * True when the visitor deep-linked straight to this dish (`?item=`): the
   * row gets an anchor id so the page can scroll to it, and a highlight so
   * the landing point is unmistakable.
   */
  readonly focused = input(false);

  readonly quantityChange = output<number>();

  protected readonly inCart = computed(() => this.quantity() > 0);
  protected readonly unavailable = computed(() => !this.item().isAvailable);

  protected add(): void {
    this.quantityChange.emit(this.quantity() + 1);
  }

  protected decrement(): void {
    this.quantityChange.emit(this.quantity() - 1);
  }
}
