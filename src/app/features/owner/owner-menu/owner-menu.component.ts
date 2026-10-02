import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';

import { MenuItem } from '../../../core/models/restaurant.model';
import { IMAGE_STORAGE } from '../../../core/services/image-storage.provider';
import { ImageStorage } from '../../../core/services/image-storage';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';
import { VegMarkerComponent } from '../../../shared/components/veg-marker.component';

/**
 * Menu manager for one restaurant.
 *
 * Adding a dish and uploading its photo are two separate steps on purpose:
 * the photo upload can fail (quota, network) without losing the typed-in dish
 * details, which is what a single combined "save" would risk.
 */
@Component({
  selector: 'app-owner-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    LoadingComponent,
    VegMarkerComponent,
  ],
  templateUrl: './owner-menu.component.html',
  styleUrl: './owner-menu.component.scss',
})
export class OwnerMenuComponent {
  private readonly restaurantService = inject(RestaurantService);
  protected readonly storage = inject<ImageStorage>(IMAGE_STORAGE);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** Route param, bound by `withComponentInputBinding()`. */
  readonly restaurantId = input.required<string>();

  private readonly restaurant = toSignal(
    toObservable(this.restaurantId).pipe(
      switchMap((id) => this.restaurantService.getRestaurant(id)),
    ),
    { initialValue: null },
  );

  /**
   * `true` until the first emission. An empty menu is a loaded state, not a
   * pending one, so readiness is tracked explicitly rather than inferred from
   * `items().length`.
   */
  private readonly ready = signal(false);

  protected readonly items = toSignal(
    toObservable(this.restaurantId).pipe(
      switchMap((id) => this.restaurantService.listMenuItems(id)),
      tap(() => this.ready.set(true)),
    ),
    { initialValue: [] as readonly MenuItem[] },
  );

  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly formVisible = signal(false);
  protected readonly imagePreview = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    price: [0, [Validators.required, Validators.min(1)]],
    category: ['', Validators.required],
    isVeg: [true],
  });

  protected readonly grouped = computed(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of this.items()) {
      const bucket = groups.get(item.category);
      if (bucket) {
        bucket.push(item);
      } else {
        groups.set(item.category, [item]);
      }
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  });

  protected readonly categories = computed(() => this.grouped().map((group) => group.name));

  protected readonly loading = computed(() => !this.ready());

  protected toggleForm(): void {
    this.formVisible.update((visible) => !visible);
    if (!this.formVisible()) {
      this.resetForm();
    }
  }

  protected startEdit(item: MenuItem): void {
    this.editingId.set(item.id);
    this.formVisible.set(true);
    this.form.setValue({
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isVeg: item.isVeg,
    });
    this.imagePreview.set(item.imageUrl);
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', description: '', price: 0, category: '', isVeg: true });
    this.imagePreview.set(null);
  }

  protected async onImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }

    this.uploading.set(true);
    try {
      const url = await this.storage.upload('menu-items', this.restaurantId(), file);
      this.imagePreview.set(url);
      this.toast.success('Dish image uploaded.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not upload the image.'));
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const restaurantId = this.restaurantId();
      const editingId = this.editingId();

      if (editingId) {
        await this.restaurantService.updateMenuItem(restaurantId, editingId, {
          ...value,
          imageUrl: this.imagePreview(),
        });
        this.toast.success('Dish updated.');
      } else {
        await this.restaurantService.addMenuItems(restaurantId, [
          { ...value, imageUrl: this.imagePreview() },
        ]);
        this.toast.success('Dish added.');
      }

      this.resetForm();
      this.formVisible.set(false);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not save the dish.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleAvailability(item: MenuItem): Promise<void> {
    try {
      await this.restaurantService.updateMenuItem(this.restaurantId(), item.id, {
        isAvailable: !item.isAvailable,
      });
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not update the dish.'));
    }
  }

  protected async remove(item: MenuItem): Promise<void> {
    try {
      await this.restaurantService.archiveMenuItem(this.restaurantId(), item.id);
      this.toast.info(`${item.name} removed from the menu.`);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not remove the dish.'));
    }
  }

  protected restaurantName(): string {
    return this.restaurant()?.name ?? '';
  }
}
