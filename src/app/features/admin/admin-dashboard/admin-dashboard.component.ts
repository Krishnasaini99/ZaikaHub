import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';

import { Order } from '../../../core/models/order.model';
import { RestaurantSummary } from '../../../core/models/restaurant.model';
import { OrderService } from '../../../core/services/order.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { TimeAgoPipe } from '../../../core/pipes/display.pipes';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';
import { StatusPillComponent } from '../../../shared/components/status-pill.component';

/**
 * Admin dashboard: platform-wide order volume, restaurant moderation, and the
 * entrance to the content tools.
 *
 * Feature-flagging an owner for the home page is a plain field update, so
 * moderation is a single write rather than a moderation workflow.
 */
@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    RouterLink,
    TimeAgoPipe,
    EmptyStateComponent,
    LoadingComponent,
    StatusPillComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent {
  private readonly orderService = inject(OrderService);
  private readonly restaurantService = inject(RestaurantService);

  protected readonly busyId = signal<string | null>(null);

  /**
   * `true` until the first emission. An empty order list is a *loaded* state,
   * not a pending one, so readiness is tracked explicitly via `tap` rather than
   * inferred from the array length.
   */
  private readonly ready = signal(false);

  protected readonly orders = toSignal(
    this.orderService.listAll().pipe(tap(() => this.ready.set(true))),
    { initialValue: [] as readonly Order[] },
  );
  protected readonly restaurants = toSignal(this.restaurantService.listRestaurants(), {
    initialValue: [] as readonly RestaurantSummary[],
  });

  protected readonly loading = computed(() => !this.ready());

  protected readonly stats = computed(() => {
    const orders = this.orders();
    const revenue = orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + order.totals.grandTotal, 0);

    return {
      total: orders.length,
      active: orders.filter(
        (order) => order.status !== 'delivered' && order.status !== 'cancelled',
      ).length,
      delivered: orders.filter((order) => order.status === 'delivered').length,
      cancelled: orders.filter((order) => order.status === 'cancelled').length,
      revenue,
    };
  });

  protected async toggleFeatured(restaurant: RestaurantSummary): Promise<void> {
    this.busyId.set(restaurant.id);
    try {
      await this.restaurantService.updateRestaurant(restaurant.id, {
        featured: !restaurant.featured,
      });
    } finally {
      this.busyId.set(null);
    }
  }
}