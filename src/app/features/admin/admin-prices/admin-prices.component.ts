import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

import type { MenuItem, RestaurantSummary } from '../../../core/models/restaurant.model';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { ToastService } from '../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';

/**
 * Price editing across every restaurant.
 *
 * Owners can already price their own dishes; this exists because the platform
 * operator also needs to correct a price without waiting for an owner, and
 * because a wrong price on a live menu is the most expensive typo in the app.
 *
 * `updateMenuItem` writes price and nothing else — the admin rules allow it, and
 * deliberately so, rather than accepting a whole document from a form.
 */
@Component({
  selector: 'app-admin-prices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, FormsModule, RouterLink, EmptyStateComponent],
  templateUrl: './admin-prices.component.html',
  styleUrl: '../admin.scss',
})
export class AdminPricesComponent {
  private readonly restaurants = inject(RestaurantService);
  private readonly toast = inject(ToastService);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly savingId = signal<string | null>(null);
  /** Per-dish edited value, so typing does not fight the incoming signal. */
  protected readonly drafts = signal<Record<string, number>>({});

  protected readonly all = toSignal(this.restaurants.listRestaurants(), {
    initialValue: [] as readonly RestaurantSummary[],
  });

  protected readonly menu = toSignal(
    toObservable(computed(() => this.selectedId())).pipe(
      switchMap((id) =>
        id ? this.restaurants.listMenuItems(id) : this.restaurants.listMenuItems('__none__'),
      ),
    ),
    { initialValue: [] as readonly MenuItem[] },
  );

  protected select(restaurant: RestaurantSummary): void {
    this.selectedId.set(restaurant.id);
    this.drafts.set({});
  }

  protected draft(item: MenuItem): number {
    const value = this.drafts()[item.id];
    return value === undefined ? item.price : value;
  }

  protected onDraft(item: MenuItem, raw: string): void {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      this.drafts.update((current) => ({ ...current, [item.id]: Math.round(parsed * 100) / 100 }));
    }
  }

  protected dirty(item: MenuItem): boolean {
    return this.draft(item) !== item.price;
  }

  protected async save(item: MenuItem): Promise<void> {
    this.savingId.set(item.id);
    try {
      await this.restaurants.updateMenuItem(item.restaurantId, item.id, {
        price: this.draft(item),
      });
      this.toast.success(`${item.name} is now ${this.draft(item)}.`);
      this.drafts.update((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch {
      this.toast.error('Could not update the price.');
    } finally {
      this.savingId.set(null);
    }
  }

  /** Restores the stored price for a dish the owner changed their mind about. */
  protected revert(item: MenuItem): void {
    this.drafts.update((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }
}