import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { CartService } from '../../core/services/cart.service';
import { VegMarkerComponent } from '../../shared/components/veg-marker.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';

/** Cart review: line items with steppers, the bill summary and a checkout CTA. */
@Component({
  selector: 'app-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, RouterLink, VegMarkerComponent, EmptyStateComponent],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
})
export class CartComponent {
  protected readonly cart = inject(CartService);

  protected readonly items = computed(() => this.cart.cartItems());
  protected readonly totals = computed(() => this.cart.totals());
  protected readonly isEmpty = computed(() => this.cart.isEmpty());
  protected readonly restaurantName = computed(() => this.cart.restaurantName() ?? '');

  protected quantityOf = this.cart.quantityOf;

  protected increment(menuItemId: string): void {
    this.cart.increment(menuItemId);
  }

  protected decrement(menuItemId: string): void {
    this.cart.increment(menuItemId, -1);
  }

  protected remove(menuItemId: string): void {
    this.cart.remove(menuItemId);
  }

  protected clear(): void {
    this.cart.clear();
  }
}
