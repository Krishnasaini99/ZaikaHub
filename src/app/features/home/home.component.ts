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
   * Twelve is a deliberate cap rather than a slice of everything: the strip is a
   * visual hook, and a long list of near-identical tiles reads as filler. The
   * cap matches the number `tools/seed.mjs` copies over from production, so the
   * banner is full locally as well as live — asking for more than exists would
   * leave a short banner with nothing to rotate to.
   */
  protected readonly highlightDishes = toSignal(
    this.restaurantService.listHighlightDishes(12),
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

  /**
   * Popular cuisines; links drive the `/restaurants?cuisine=` filter.
   *
   * The photo and its credit live here rather than in Firestore because the
   * rest of this row — the name, the emoji fallback and the filter value — is
   * already static content in this file. Splitting the image into a collection
   * would mean one row of the same card being edited in two places.
   *
   * URLs are the Cloudinary originals resized once, so the browser downloads one
   * small file instead of a full-resolution photograph for a tile roughly
   * 160px wide. All eight come from Wikimedia Commons under CC0 or CC BY, so
   * `imageCredit` is a licence requirement and not decoration.
   */
  protected readonly cuisines: readonly {
    name: string;
    emoji: string;
    imageUrl: string;
    imageCredit: string;
  }[] = [
    {
      name: 'Biryani',
      emoji: '🍛',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012527/zaika-hub/cuisines/cuisine-biryani.jpg',
      imageCredit: 'Hyderabadi Chicken Biryani — Garrett Ziegler (CC BY 2.0)',
    },
    {
      name: 'Pizza',
      emoji: '🍕',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012530/zaika-hub/cuisines/cuisine-pizza.jpg',
      imageCredit: 'Pizza Margherita — jeffreyw (CC BY 2.0)',
    },
    {
      name: 'Burgers',
      emoji: '🍔',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012532/zaika-hub/cuisines/cuisine-burgers.jpg',
      imageCredit: 'Crown Burger Plus hamburger and fries — Max Slowik (CC BY 2.0)',
    },
    {
      name: 'Desserts',
      emoji: '🍰',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012535/zaika-hub/cuisines/cuisine-desserts.jpg',
      imageCredit: 'Piece of chocolate cake — Daria Yakovleva (CC0)',
    },
    {
      name: 'Chinese',
      emoji: '🥡',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012539/zaika-hub/cuisines/cuisine-chinese.jpg',
      imageCredit: 'Dim Sum Breakfast — afterdog (CC0)',
    },
    {
      name: 'South Indian',
      emoji: '🥞',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012543/zaika-hub/cuisines/cuisine-south-indian.jpg',
      imageCredit: 'Dosa-chutney-sambhar — Roland (CC BY 2.0)',
    },
    {
      name: 'North Indian',
      emoji: '🍲',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012546/zaika-hub/cuisines/cuisine-north-indian.jpg',
      imageCredit: 'Vegetarian Curry — GracinhaMarco Abundo (CC BY 2.0)',
    },
    {
      name: 'Street Food',
      emoji: '🌭',
      imageUrl:
        'https://res.cloudinary.com/wws3fzud/image/upload/f_auto,q_auto,w_480/v1791012549/zaika-hub/cuisines/cuisine-street-food.jpg',
      imageCredit: 'Vada Pavs — Warren Noronha (CC BY 2.0)',
    },
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
