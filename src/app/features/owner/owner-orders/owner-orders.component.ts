import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';

import { Order, OrderStatus, PaymentMethod } from '../../../core/models/order.model';
import { OrderService, nextStatus } from '../../../core/services/order.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';
import { TimeAgoPipe } from '../../../core/pipes/display.pipes';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';
import { StatusPillComponent, humaniseStatus } from '../../../shared/components/status-pill.component';

/**
 * Incoming orders for one restaurant, with status advancement.
 *
 * Only the *next* status is offered rather than a free-form dropdown, so an
 * order can never skip a step in the timeline (e.g. jumping straight from
 * "placed" to "delivered").
 */
@Component({
  selector: 'app-owner-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    RouterLink,
    TimeAgoPipe,
    EmptyStateComponent,
    LoadingComponent,
    StatusPillComponent,
  ],
  templateUrl: './owner-orders.component.html',
  styleUrl: './owner-orders.component.scss',
})
export class OwnerOrdersComponent {
  private readonly orderService = inject(OrderService);
  private readonly toast = inject(ToastService);

  readonly restaurantId = input.required<string>();

  protected readonly updatingId = signal<string | null>(null);
  protected readonly filter = signal<'all' | 'active' | 'completed'>('all');

  /** See `owner-menu`: an empty order list is loaded, not pending. */
  private readonly ready = signal(false);

  protected readonly orders = toSignal(
    toObservable(this.restaurantId).pipe(
      switchMap((id) => this.orderService.listForRestaurant(id)),
      tap(() => this.ready.set(true)),
    ),
    { initialValue: [] as readonly Order[] },
  );

  protected readonly loading = computed(() => !this.ready());

  protected readonly visibleOrders = computed(() => {
    const list = this.orders();
    switch (this.filter()) {
      case 'active':
        return list.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled');
      case 'completed':
        return list.filter((order) => order.status === 'delivered' || order.status === 'cancelled');
      default:
        return list;
    }
  });

  protected readonly activeCount = computed(
    () =>
      this.orders().filter(
        (order) => order.status !== 'delivered' && order.status !== 'cancelled',
      ).length,
  );

  /** The one status this order can move to next, or `null` when finished. */
  protected nextStep(order: Order): OrderStatus | null {
    return nextStatus(order.status);
  }

  protected nextStepLabel(order: Order): string {
    const step = this.nextStep(order);
    return step ? `Mark as ${humaniseStatus(step).toLowerCase()}` : 'Completed';
  }

  protected async advance(order: Order): Promise<void> {
    const step = this.nextStep(order);
    if (!step || this.updatingId() === order.id) {
      return;
    }

    this.updatingId.set(order.id);
    try {
      // A one-hour ETA is attached once the restaurant accepts the order.
      await this.orderService.updateStatus(order.id, step, step === 'accepted' ? 60 : null);
      this.toast.success(`Order marked as ${humaniseStatus(step).toLowerCase()}.`);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not update the order.'));
    } finally {
      this.updatingId.set(null);
    }
  }

  protected async cancel(order: Order): Promise<void> {
    if (this.updatingId() === order.id) {
      return;
    }
    this.updatingId.set(order.id);
    try {
      await this.orderService.cancelOrder(order.id, 'Cancelled by the restaurant');
      this.toast.info('Order cancelled.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not cancel the order.'));
    } finally {
      this.updatingId.set(null);
    }
  }

  protected setFilter(value: 'all' | 'active' | 'completed'): void {
    this.filter.set(value);
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
}
