import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { HighlightDish, RestaurantSummary } from '../../core/models/restaurant.model';
import { RestaurantService } from '../../core/services/restaurant.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { HeroShowcaseComponent } from '../../shared/components/hero-showcase.component';
import { ImageCreditComponent } from '../../shared/components/image-credit.component';
import { LoadingComponent } from '../../shared/components/loading.component';
import { RestaurantCardComponent } from '../../shared/components/restaurant-card.component';
import { VegMarkerComponent } from '../../shared/components/veg-marker.component';

/**
 * Landing page: search entry point, dish showcase, cuisine shortcuts, and a
 * featured strip of restaurants.
 *
 * SEO for this page lives in `app.routes.ts`, not here — see `SeoTitleStrategy`.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CurrencyPipe,
    RestaurantCardComponent,
    EmptyStateComponent,
    HeroShowcaseComponent,
    VegMarkerComponent,
    ImageCreditComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly restaurantService = inject(RestaurantService);
  private readonly router = inject(Router);

  /**
   * Curated dishes shown before anyone signs in.
   *
   * Ten is a deliberate cap rather than a slice of everything: the strip is a
   * visual hook, and a long list of near-identical tiles reads as filler.
   */
  protected readonly highlightDishes = toSignal(
    this.restaurantService.listHighlightDishes(10),
    { initialValue: [] as readonly HighlightDish[] },
  );

  /** `toSignal` bridges the Firestore observable into the template's signal world. */
  private readonly featured = toSignal(this.restaurantService.listFeatured(), {
    initialValue: [] as readonly RestaurantSummary[],
  });

  protected readonly searchTerm = signal('');
  protected readonly showAll = signal(false);

  protected readonly featuredRestaurants = computed(() =>
    this.showAll() ? this.featured() : this.featured().slice(0, 6),
  );
  protected readonly hasMore = computed(() => this.featured().length > 6);

  /** Popular cuisines; links drive the `/restaurants?cuisine=` filter. */
  protected readonly cuisines: readonly { name: string; emoji: string }[] = [
    { name: 'Biryani', emoji: '🍛' },
    { name: 'Pizza', emoji: '🍕' },
    { name: 'Burgers', emoji: '🍔' },
    { name: 'Desserts', emoji: '🍰' },
    { name: 'Chinese', emoji: '🥡' },
    { name: 'South Indian', emoji: '🥞' },
    { name: 'North Indian', emoji: '🍲' },
    { name: 'Street Food', emoji: '🌭' },
  ];

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  /** Submits the search box to the listing page as a query param. */
  protected async submitSearch(event: Event): Promise<void> {
    event.preventDefault();
    const term = this.searchTerm().trim();
    if (!term) {
      return;
    }
    await this.router.navigate(['/restaurants'], { queryParams: { q: term } });
  }

  protected toggleShowAll(): void {
    this.showAll.update((value) => !value);
  }
}
