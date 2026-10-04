import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { Coupon, CouponCheck } from '../../core/models/coupon.model';
import { CartService } from '../../core/services/cart.service';
import { CouponService } from '../../core/services/coupon.service';
import { ToastService } from '../../core/services/toast.service';
import { evaluateCoupon, normaliseCode } from '../../core/utils/coupon.util';
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
  private readonly coupons = inject(CouponService);
  private readonly toast = inject(ToastService);

  protected readonly items = computed(() => this.cart.cartItems());
  protected readonly totals = computed(() => this.cart.totals());
  protected readonly isEmpty = computed(() => this.cart.isEmpty());
  protected readonly restaurantName = computed(() => this.cart.restaurantName() ?? '');

  protected quantityOf = this.cart.quantityOf;

  // ------------------------------------------------------------- coupons

  protected readonly couponCode = signal('');
  protected readonly appliedCoupon = signal<Coupon | null>(null);
  protected readonly couponError = signal<string | null>(null);
  protected readonly couponMessage = signal<string | null>(null);

  /**
   * Re-evaluates whenever the cart changes.
   *
   * Live rather than checked once at apply time: a cart edited afterwards can
   * drop below a coupon's minimum, and a discount that quietly keeps applying
   * would be a pricing bug, not a convenience.
   */
  protected readonly couponCheck = computed<CouponCheck | null>(() => {
    const coupon = this.appliedCoupon();
    if (!coupon) {
      return null;
    }
    return evaluateCoupon(coupon, {
      subtotal: this.totals().itemTotal,
      previousOrderCount: 0,
      now: new Date(),
    });
  });

  /**
   * What the bill becomes.
   *
   * `free_delivery` zeroes the fee rather than taking it off the subtotal, so
   * the summary still shows a delivery line the customer can understand.
   */
  protected readonly adjusted = computed(() => {
    const totals = this.totals();
    const check = this.couponCheck();
    if (!check?.ok) {
      return { ...totals, discount: totals.discount, grandTotal: totals.grandTotal };
    }
    const coupon = this.appliedCoupon();
    const freeDelivery = coupon?.type === 'free_delivery';
    const discount = Math.min(check.discount, totals.itemTotal);
    const deliveryFee = freeDelivery ? 0 : totals.deliveryFee;
    return {
      ...totals,
      deliveryFee,
      discount: totals.discount + discount,
      grandTotal: Math.max(0, round2(totals.itemTotal + deliveryFee + totals.taxes - (totals.discount + discount))),
    };
  });

  /** Apply button: normalises what was typed, then resolves the code document. */
  protected onApplyCoupon(code: string): void {
    const typed = code.trim();
    if (!typed) {
      return;
    }
    this.couponError.set(null);
    this.couponMessage.set(null);
    void this.applyCoupon(typed);
  }

  protected async applyCoupon(typed: string): Promise<void> {
    // One point read: the document id is the normalised code.
    const snapshot = await this.coupons.snapshotByCode(typed);
    const check = evaluateCoupon(snapshot, {
      subtotal: this.totals().itemTotal,
      previousOrderCount: 0,
      now: new Date(),
    });

    if (!check.ok || !snapshot) {
      this.appliedCoupon.set(null);
      this.couponError.set(check.message);
      return;
    }
    this.appliedCoupon.set(snapshot);
    this.couponCode.set(normaliseCode(typed));
    this.couponMessage.set(check.message);
  }

  protected removeCoupon(): void {
    this.appliedCoupon.set(null);
    this.couponCode.set('');
    this.couponMessage.set(null);
    this.couponError.set(null);
  }

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
    this.removeCoupon();
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
