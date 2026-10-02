import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';

import { Order, PaymentMethod } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrderService, isCancellable, isTerminal } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';
import { TimeAgoPipe } from '../../core/pipes/display.pipes';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingComponent } from '../../shared/components/loading.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { VegMarkerComponent } from '../../shared/components/veg-marker.component';

/**
 * Customer order history with live statuses.
 *
 * The list is a direct Firestore stream, so an owner updating an order in
 * their own panel appears here without a refresh — there is no polling
 * anywhere in this app.
 */
@Component({
  selector: 'app-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    RouterLink,
    TimeAgoPipe,
    EmptyStateComponent,
    LoadingComponent,
    StatusPillComponent,
    VegMarkerComponent,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
})
export class OrdersComponent {
  private readonly auth = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly uid = toSignal(toObservable(this.auth.uid));

  /**
   * `true` until the first emission. Deriving "loading" from `orders().length`
   * would be wrong — an empty history is a valid loaded state, not a pending
   * one — so readiness is tracked explicitly via `tap`.
   */
  private readonly ready = signal(false);

  protected readonly orders = toSignal(
    toObservable(this.uid).pipe(
      switchMap((uid) => this.orderService.listForUser(uid ?? '')),
      tap(() => this.ready.set(true)),
    ),
    { initialValue: [] as readonly Order[] },
  );

  protected readonly loading = computed(() => !this.ready());

  /** Orders still moving through the delivery pipeline. */
  protected readonly activeOrders = computed(() =>
    this.orders().filter((order) => !isTerminal(order.status)),
  );

  /** Delivered and cancelled orders — the two terminal states. */
  protected readonly pastOrders = computed(() =>
    this.orders().filter((order) => isTerminal(order.status)),
  );

  protected canCancel(order: Order): boolean {
    return isCancellable(order.status);
  }

  protected paymentLabel(method: PaymentMethod): string {
    switch (method) {
      case 'cod':
        return 'Cash on delivery';
      case 'upi':
        return 'UPI';
      case 'card':
        return 'Card';
      default:
        return method;
    }
  }

  /**
   * "Reorder" re-fills the cart with the same dishes, then sends the user to
   * that restaurant so they can review before checking out. The cart is
   * cleared first because it can only ever hold one restaurant at a time.
   */
  protected async reorder(order: Order): Promise<void> {
    if (this.cart.isEmpty() && this.cart.restaurantId() !== order.restaurantId) {
      this.toast.info('Your cart was replaced with this order.');
    } else {
      this.cart.clear();
    }

    for (const item of order.items) {
      this.cart.add({
        menuItemId: item.menuItemId,
        restaurantId: order.restaurantId,
        restaurantName: order.restaurantName,
        name: item.name,
        price: item.price,
        isVeg: item.isVeg,
        imageUrl: null,
      }, item.quantity);
    }

    this.toast.success('Items added to your cart.');
    await this.router.navigate(['/restaurant', order.restaurantId]);
  }
}
