import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { PRICE_BANDS, PriceBand, RestaurantSummary } from '../../core/models/restaurant.model';
import { RestaurantService } from '../../core/services/restaurant.service';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../core/services/seo.service';
import { restaurantListJsonLd } from '../../core/utils/structured-data.util';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { RestaurantCardComponent } from '../../shared/components/restaurant-card.component';

const SORT_OPTIONS = [
  { value: 'rating', label: 'Rating: high to low' },
  { value: 'deliveryTime', label: 'Delivery time' },
  { value: 'costLowToHigh', label: 'Cost: low to high' },
  { value: 'costHighToLow', label: 'Cost: high to low' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

/**
 * Restaurant listing with search, cuisine/price/rating filters and sorting.
 *
 * Filter state lives in the URL query string, so a filtered view is
 * shareable, survives a refresh, and the browser's back button behaves.
 * Firestore still returns a bounded list; the remaining filtering happens in
 * {@link applyFilters} because Firestore cannot do "array contains any of N".
 */
@Component({
  selector: 'app-restaurants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RestaurantCardComponent, EmptyStateComponent],
  templateUrl: './restaurants.component.html',
  styleUrl: './restaurants.component.scss',
})
export class RestaurantsComponent {
  private readonly restaurantService = inject(RestaurantService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  private readonly all = toSignal(this.restaurantService.listRestaurants(), {
    initialValue: [] as readonly RestaurantSummary[],
  });

  // --- URL-backed state -------------------------------------------------
  protected readonly search = signal('');
  protected readonly cuisines = signal<readonly string[]>([]);
  protected readonly priceBands = signal<readonly PriceBand[]>([]);
  protected readonly minRating = signal<number | null>(null);
  protected readonly maxDeliveryTime = signal<number | null>(null);
  protected readonly sortBy = signal<SortOption | null>(null);
  protected readonly filtersOpen = signal(false);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly allPriceBands = PRICE_BANDS;
  protected readonly ratingOptions = [4.5, 4, 3.5] as const;
  protected readonly deliveryOptions = [30, 45, 60] as const;

  protected readonly activeFilterCount = computed(
    () =>
      this.cuisines().length +
      this.priceBands().length +
      (this.minRating() === null ? 0 : 1) +
      (this.maxDeliveryTime() === null ? 0 : 1),
  );

  /** Every cuisine present in the dataset, for the filter chip list. */
  protected readonly availableCuisines = computed(() => {
    const set = new Set<string>();
    for (const restaurant of this.all()) {
      for (const cuisine of restaurant.cuisines) {
        set.add(cuisine);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  protected readonly results = computed(() =>
    applyFilters(this.all(), {
      search: this.search(),
      cuisines: this.cuisines(),
      priceBands: this.priceBands(),
      minRating: this.minRating(),
      maxDeliveryTime: this.maxDeliveryTime(),
      sortBy: this.sortBy(),
    }),
  );

  constructor() {
    // The listing page is the one indexable page that had no structured data:
    // every restaurant page emits a `Restaurant` node, but nothing tied them
    // together. Re-published whenever the visible set changes so the ItemList
    // never describes rows the page is not showing.
    effect(() => {
      const visible = this.results();
      this.seo.apply({
        title: 'Restaurants near you — order food online',
        description:
          visible.length > 0
            ? `Browse ${visible.length} restaurants near you. Filter by cuisine, price, rating and delivery time.`
            : 'Browse restaurants near you. Filter by cuisine, price, rating and delivery time.',
        path: '/restaurants',
        jsonLd: restaurantListJsonLd(visible, environment.siteUrl),
      });
    });
    // Rehydrate from the URL whenever the query params change (including
    // navigation away and back).
    this.route.queryParamMap.subscribe((params) => {
      this.search.set(params.get('q') ?? '');
      this.cuisines.set(splitCsv(params.get('cuisine')));
      this.priceBands.set(splitCsv(params.get('price')) as PriceBand[]);
      this.minRating.set(toNumberOrNull(params.get('rating')));
      this.maxDeliveryTime.set(toNumberOrNull(params.get('time')));
      this.sortBy.set((params.get('sort') as SortOption | null) ?? null);
    });
  }

  protected onSearchInput(event: Event): void {
    this.patchUrl({ q: (event.target as HTMLInputElement).value || null });
  }

  protected toggleCuisine(cuisine: string): void {
    const next = this.cuisines().includes(cuisine)
      ? this.cuisines().filter((c) => c !== cuisine)
      : [...this.cuisines(), cuisine];
    this.patchUrl({ cuisine: next.length ? next.join(',') : null });
  }

  protected togglePriceBand(band: PriceBand): void {
    const current = this.priceBands();
    const next = current.includes(band)
      ? current.filter((b) => b !== band)
      : [...current, band];
    this.patchUrl({ price: next.length ? next.join(',') : null });
  }

  protected setMinRating(value: number): void {
    this.patchUrl({ rating: this.minRating() === value ? null : String(value) });
  }

  protected setMaxDeliveryTime(value: number): void {
    this.patchUrl({ time: this.maxDeliveryTime() === value ? null : String(value) });
  }

  protected onSortChange(event: Event): void {
    this.patchUrl({ sort: (event.target as HTMLSelectElement).value || null });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /**
   * Writes filter state to the URL. `null` values are removed so the URL stays
   * clean, and the query param object is rebuilt from the current state each
   * time to avoid clobbering unrelated params.
   */
  private patchUrl(changes: Record<string, string | null>): void {
    const queryParams: Record<string, string> = {};
    const state = {
      q: this.search(),
      cuisine: this.cuisines().join(','),
      price: this.priceBands().join(','),
      rating: this.minRating()?.toString() ?? '',
      time: this.maxDeliveryTime()?.toString() ?? '',
      sort: this.sortBy() ?? '',
    };

    for (const [key, value] of Object.entries(changes)) {
      state[key as keyof typeof state] = value ?? '';
    }
    for (const [key, value] of Object.entries(state)) {
      if (value) {
        queryParams[key] = value;
      }
    }

    void this.router.navigate([], { queryParams, replaceUrl: true });
  }
}

// ------------------------------------------------------------------ helpers

function splitCsv(value: string | null): readonly string[] {
  return value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [];
}

function toNumberOrNull(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface FilterState {
  readonly search: string;
  readonly cuisines: readonly string[];
  readonly priceBands: readonly PriceBand[];
  readonly minRating: number | null;
  readonly maxDeliveryTime: number | null;
  readonly sortBy: SortOption | null;
}

export function applyFilters(
  restaurants: readonly RestaurantSummary[],
  state: FilterState,
): readonly RestaurantSummary[] {
  const term = state.search.trim().toLowerCase();
  const cuisines = state.cuisines.map((c) => c.toLowerCase());

  const filtered = restaurants.filter((restaurant) => {
    if (term) {
      const haystack = [restaurant.name, restaurant.area, restaurant.city, ...restaurant.cuisines]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) {
        return false;
      }
    }
    if (
      cuisines.length > 0 &&
      !restaurant.cuisines.some((c) => cuisines.includes(c.toLowerCase()))
    ) {
      return false;
    }
    if (state.priceBands.length > 0 && !state.priceBands.includes(restaurant.priceBand)) {
      return false;
    }
    if (state.minRating !== null && restaurant.rating < state.minRating) {
      return false;
    }
    if (
      state.maxDeliveryTime !== null &&
      restaurant.deliveryTimeMinutes > state.maxDeliveryTime
    ) {
      return false;
    }
    return true;
  });

  // Copy before sorting: the source array is a readonly computed value.
  const sorted = [...filtered];
  switch (state.sortBy) {
    case 'deliveryTime':
      return sorted.sort((a, b) => a.deliveryTimeMinutes - b.deliveryTimeMinutes);
    case 'costLowToHigh':
      return sorted.sort((a, b) => a.costForTwo - b.costForTwo);
    case 'costHighToLow':
      return sorted.sort((a, b) => b.costForTwo - a.costForTwo);
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating);
    default:
      return sorted;
  }
}
