import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';

import type { Coupon, CouponType } from '../../../core/models/coupon.model';
import { COUPON_TYPES } from '../../../core/models/coupon.model';
import { CouponService } from '../../../core/services/coupon.service';
import { ToastService } from '../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';

/**
 * Coupon management: create, edit, pause and delete discount codes.
 *
 * Validation lives in the shared `coupon.util` so what the admin form accepts
 * and what the cart honours cannot drift apart; this component only collects
 * input and reports the outcome.
 */
@Component({
  selector: 'app-admin-coupons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, EmptyStateComponent, LoadingComponent],
  templateUrl: './admin-coupons.component.html',
  styleUrl: '../admin.scss',
})
export class AdminCouponsComponent {
  private readonly coupons = inject(CouponService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly types = COUPON_TYPES;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<string | null>(null);

  /** `loading` clears on the first emission, not on an empty list. */
  protected readonly list = toSignal(
    this.coupons.watchAll().pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as readonly Coupon[] },
  );

  /** `null` on a typed date input means "no limit", stored as null not epoch. */
  private static readonly EMPTY_DATE = '';
  private static readonly EMPTY_NUMBER = '';

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]+$/)]],
    type: ['percentage' as CouponType, Validators.required],
    value: [10, [Validators.min(0)]],
    minOrderAmount: [0, [Validators.min(0)]],
    startsAt: [AdminCouponsComponent.EMPTY_DATE],
    expiresAt: [AdminCouponsComponent.EMPTY_DATE],
    maxRedemptions: [AdminCouponsComponent.EMPTY_NUMBER],
    maxPerUser: [AdminCouponsComponent.EMPTY_NUMBER],
    isActive: [true],
    description: ['', Validators.maxLength(80)],
  });

  protected readonly editing = computed(() =>
    this.list().find((c) => c.id === this.editingId()) ?? null,
  );

  /** Free delivery has no value field, so it is hidden rather than disabled. */
  protected readonly needsValue = computed(() => this.form.controls.type.value !== 'free_delivery');

  protected reset(): void {
    this.editingId.set(null);
    this.form.reset({
      code: '',
      type: 'percentage',
      value: 10,
      minOrderAmount: 0,
      startsAt: '',
      expiresAt: '',
      maxRedemptions: '',
      maxPerUser: '',
      isActive: true,
      description: '',
    });
  }

  protected edit(coupon: Coupon): void {
    this.editingId.set(coupon.id);
    this.form.patchValue({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderAmount: coupon.minOrderAmount,
      startsAt: toInputDate(coupon.startsAt),
      expiresAt: toInputDate(coupon.expiresAt),
      maxRedemptions: coupon.maxRedemptions === null ? '' : String(coupon.maxRedemptions),
      maxPerUser: coupon.maxPerUser === null ? '' : String(coupon.maxPerUser),
      isActive: coupon.isActive,
      description: coupon.description,
    });
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const current = this.editing();
      await this.coupons.save({
        id: current?.id,
        code: v.code,
        type: v.type,
        value: v.type === 'free_delivery' ? 0 : Number(v.value),
        minOrderAmount: Number(v.minOrderAmount),
        startsAt: fromInputDate(v.startsAt),
        expiresAt: fromInputDate(v.expiresAt),
        maxRedemptions: toOptionalNumber(v.maxRedemptions),
        maxPerUser: toOptionalNumber(v.maxPerUser),
        isActive: v.isActive,
        description: v.description,
        usageCount: current?.usageCount,
      });
      this.toast.success(current ? 'Coupon updated.' : 'Coupon created.');
      this.reset();
    } catch {
      this.toast.error('Could not save the coupon.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleActive(coupon: Coupon): Promise<void> {
    await this.coupons.save({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderAmount: coupon.minOrderAmount,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      maxRedemptions: coupon.maxRedemptions,
      maxPerUser: coupon.maxPerUser,
      isActive: !coupon.isActive,
      description: coupon.description,
      usageCount: coupon.usageCount,
    });
    this.toast.success(coupon.isActive ? 'Coupon paused.' : 'Coupon activated.');
  }

  /** Human summary shown in the table, so the admin never has to read the maths. */
  protected summarise(coupon: Coupon): string {
    if (coupon.type === 'free_delivery') {
      return 'Free delivery';
    }
    return coupon.type === 'percentage'
      ? `${coupon.value}% off`
      : `₹${coupon.value} off`;
  }

  protected statusOf(coupon: Coupon): 'Live' | 'Paused' | 'Expired' {
    if (!coupon.isActive) {
      return 'Paused';
    }
    if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
      return 'Expired';
    }
    return 'Live';
  }
}

/** `Date | null` → `yyyy-MM-dd` for `<input type="date">`; empty means unset. */
function toInputDate(value: Date | null): string {
  if (!value) {
    return '';
  }
  const iso = value.toISOString();
  return iso.slice(0, 10);
}

/**
 * `yyyy-MM-dd` → `Date | null`.
 *
 * Read as UTC midnight rather than local midnight: a date-only field has no
 * timezone, and using the local constructor would shift a coupon's start by the
 * machine's offset — turning "starts today" into "starts tomorrow" for anyone
 * east or west of UTC.
 */
function fromInputDate(value: string): Date | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Blank means unlimited, which is `null` rather than 0 — 0 would block everyone. */
function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}