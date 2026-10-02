import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';

import {
  FulfillmentMode,
  OpeningHours,
  PriceBand,
  RestaurantSummary,
} from '../../../core/models/restaurant.model';
import { AuthService } from '../../../core/services/auth.service';
import { ImageStorage } from '../../../core/services/image-storage';
import { IMAGE_STORAGE } from '../../../core/services/image-storage.provider';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';

const CUISINE_OPTIONS = [
  'Biryani',
  'North Indian',
  'South Indian',
  'Chinese',
  'Pizza',
  'Burgers',
  'Desserts',
  'Street Food',
  'Continental',
] as const;

/**
 * Owner panel: list the restaurants this account owns and publish new ones.
 *
 * The image is uploaded to storage *first*, and only the resulting URL is
 * stored on the Firestore document. Storing paths instead would force the
 * client to resolve them on every read.
 *
 * Image uploads go through the `IMAGE_STORAGE` token, so the backend
 * (Cloudinary or Firebase Storage) is chosen by `environment.ts` — this
 * component is identical either way.
 */
@Component({
  selector: 'app-owner-restaurants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, EmptyStateComponent, LoadingComponent],
  templateUrl: './owner-restaurants.component.html',
  styleUrl: './owner-restaurants.component.scss',
})
export class OwnerRestaurantsComponent {
  private readonly auth = inject(AuthService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private readonly uid = toSignal(toObservable(this.auth.uid));

  /** See `owner-menu`: an empty list is loaded, not pending. */
  private readonly ready = signal(false);

  protected readonly restaurants = toSignal(
    toObservable(this.uid).pipe(
      switchMap((uid) => this.restaurantService.listByOwner(uid ?? '')),
      tap(() => this.ready.set(true)),
    ),
    { initialValue: [] as readonly RestaurantSummary[] },
  );

  protected readonly cuisineOptions = CUISINE_OPTIONS;
  protected readonly priceBands: readonly PriceBand[] = ['budget', 'mid', 'premium'];
  protected readonly modes: readonly FulfillmentMode[] = ['delivery', 'pickup'];

  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadPercent = signal<number | null>(null);
  protected readonly formVisible = signal(false);
  protected readonly coverPreview = signal<string | null>(null);
  protected readonly selectedCuisines = signal<readonly string[]>([]);
  protected readonly selectedModes = signal<readonly FulfillmentMode[]>(['delivery']);

  protected readonly storage = inject<ImageStorage>(IMAGE_STORAGE);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    cuisines: ['', Validators.required],
    priceBand: ['mid' as PriceBand, Validators.required],
    costForTwo: [500, [Validators.required, Validators.min(1)]],
    deliveryTimeMinutes: [40, [Validators.required, Validators.min(10), Validators.max(180)]],
    area: ['', Validators.required],
    city: ['', Validators.required],
    address: ['', Validators.required],
    openTime: ['09:30', Validators.required],
    closeTime: ['23:00', Validators.required],
  });

  protected readonly loading = computed(() => !this.ready());
  protected readonly hasNone = computed(() => this.restaurants().length === 0);

  protected toggleCuisine(cuisine: string): void {
    this.selectedCuisines.update((current) =>
      current.includes(cuisine) ? current.filter((c) => c !== cuisine) : [...current, cuisine],
    );
  }

  protected toggleMode(mode: FulfillmentMode): void {
    this.selectedModes.update((current) =>
      current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode],
    );
  }

  protected toggleForm(): void {
    this.formVisible.update((visible) => !visible);
  }

  /**
   * Uploads the cover image and keeps the returned URL for the preview.
   *
   * The upload runs before the restaurant is published, so a failed upload
   * never leaves a published restaurant with no cover.
   */
  protected async onCoverSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const uid = this.uid();
    if (!file || !uid) {
      return;
    }

    this.uploading.set(true);
    this.uploadPercent.set(0);
    try {
      const url = await this.storage.uploadWithProgress(
        'restaurants',
        uid,
        file,
        (percent) => this.uploadPercent.set(percent),
      );
      this.coverPreview.set(url);
      this.toast.success('Cover image uploaded.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not upload the image.'));
    } finally {
      this.uploading.set(false);
      this.uploadPercent.set(null);
    }
  }

  protected async publish(): Promise<void> {
    const uid = this.uid();
    if (!uid || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.selectedCuisines().length === 0) {
      this.toast.error('Select at least one cuisine.');
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const restaurantId = await this.restaurantService.publishRestaurant(uid, {
        name: value.name,
        cuisines: this.selectedCuisines(),
        priceBand: value.priceBand,
        costForTwo: value.costForTwo,
        deliveryTimeMinutes: value.deliveryTimeMinutes,
        city: value.city,
        area: value.area,
        address: value.address,
        modes: this.selectedModes().length > 0 ? this.selectedModes() : ['delivery'],
        openingHours: toOpeningHours(value.openTime, value.closeTime),
        coverImageUrl: this.coverPreview(),
        logoImageUrl: null,
      });

      // `publishRestaurant` already wrote the owner link; re-read the profile so
      // the role shown in the header updates from "customer" to "owner".
      await this.auth.reloadProfile();

      this.toast.success('Restaurant published. Add your menu items next.');
      await this.router.navigate(['/owner/restaurants', restaurantId, 'menu']);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not publish the restaurant.'));
    } finally {
      this.saving.set(false);
    }
  }
}

/** "09:30" → 570. An unparseable value falls back to 9:30 am. */
function toOpeningHours(openTime: string, closeTime: string): OpeningHours {
  return { open: parseTime(openTime, 570), close: parseTime(closeTime, 1380) };
}

function parseTime(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return fallback;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return fallback;
  }
  return hours * 60 + minutes;
}