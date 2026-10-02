import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { OrderStatus } from '../../core/models/order.model';

/** Order-status pill, colour-coded by tone so state reads at a glance. */
@Component({
  selector: 'app-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="cssClass()">{{ label() }}</span>`,
  styles: '',
})
export class StatusPillComponent {
  readonly status = input.required<OrderStatus>();

  protected readonly label = computed(() => humaniseStatus(this.status()));
  protected readonly cssClass = computed(() => `badge--${toneForStatus(this.status())}`);
}

/** "out_for_delivery" → "Out for delivery". */
export function humaniseStatus(status: OrderStatus): string {
  const text = status.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Maps a status onto the semantic tone used by `.badge--*` in the global styles. */
export function toneForStatus(status: OrderStatus): 'success' | 'danger' | 'info' | 'warning' {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'preparing':
    case 'out_for_delivery':
      return 'info';
    case 'placed':
    case 'accepted':
    default:
      return 'warning';
  }
}
