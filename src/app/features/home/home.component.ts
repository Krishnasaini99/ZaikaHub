import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, map, of, switchMap } from 'rxjs';

import {
  DishStat,
  HighlightDish,
  MenuItem,
  RestaurantSummary,
} from '../../core/models/restaurant.model';
import type { CuisineTile } from '../../core/models/site-content.model';
import { CartService } from '../../core/services/cart.service';
import { DishStatsService } from '../../core/services/dish-stats.service';
import { RestaurantService } from '../../core/services/restaurant.service';
import { SiteContentService } from '../../core/services/site-content.service';
import { ToastService } from '../../core/services/toast.service';
import { DEFAULT_SITE_CONTENT } from '../../core/utils/site-content.util';
import { TOP_DISHES_PER_RESTAURANT, pickTopDishes } from '../../core/utils/dish-sales.util';
import type { TopDish } from '../../core/utils/dish-sales.util';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { HeroShowcaseComponent } from '../../shared/components/hero-showcase.component';
import { ImageCreditComponent } from '../../shared/components/image-credit.component';
import { LoadingComponent } from '../../shared/components/loading.component';
import { MostSoldDishesComponent } from '../../shared/components/most-sold-dishes.component';
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
    MostSoldDishesComponent,
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
  private readonly dishStats = inject(DishStatsService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly siteContent = inject(SiteContentService);

  /**
   * Owner-editable copy for this page.
   *
   * Emits the built-in defaults until the document exists, so a fresh install
   * renders exactly as it did before the admin area existed.
   */
  protected readonly content = toSignal(this.siteContent.watch(), {
    initialValue: DEFAULT_SITE_CONTENT,
  });

  /**
   * Cuisine tiles: the owner's stored ones when there are any, otherwise the
   * built-in list below.
   *
   * The fallback is the point — an empty collection must not silently delete the
   * whole row from the home page. `filter` is what the tile links to, and the
   * built-ins derive it from the label because they only ever had a name.
   */
  private readonly storedTiles = toSignal(this.siteContent.watchCuisineTiles(), {
    initialValue: [] as readonly CuisineTile[],
  });

  protected readonly cuisineTiles = computed(() => {
    const stored = this.storedTiles();
    if (stored.length > 0) {
      return stored;
    }
    return this.cuisines.map((tile, index) => ({ ...tile, filter: tile.name, order: index }));
  });

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
   * Menus of the featured restaurants, keyed by restaurant id.
   *
   * One query per featured card rather than one for the whole catalogue: the
   * featured set is capped at six, each menu is a handful of documents, and
   * the alternative — denormalising menus onto the restaurant — would make
   * every listing query pay for data only this block needs.
   */
  private readonly menusByRestaurant = toSignal(
    toObservable(this.featured).pipe(
      switchMap((restaurants) => {
        if (restaurants.length === 0) {
          return of({} as Readonly<Record<string, readonly MenuItem[]>>);
        }
        return combineLatest(
          restaurants.map((restaurant) =>
            this.restaurantService
              .listMenuItems(restaurant.id)
              .pipe(map((items) => [restaurant.id, items] as const)),
          ),
        ).pipe(
          map(
            (entries) =>
              Object.fromEntries(entries) as Readonly<Record<string, readonly MenuItem[]>>,
          ),
        );
      }),
    ),
    { initialValue: {} as Readonly<Record<string, readonly MenuItem[]>> },
  );

  /** Published sales counters; the home page only reads these, never writes. */
  private readonly salesStats = toSignal(this.dishStats.listStats(), {
    initialValue: [] as readonly DishStat[],
  });

  /**
   * Top dishes per featured restaurant for the rows under each card.
   *
   * Stats arrive as a flat list and are re-keyed per restaurant here, so the
   * counting util receives exactly the shape its unit tests cover — the
   * component never reimplements ranking inline.
   */
  protected readonly topDishesByRestaurant = computed(() => {
    const menus = this.menusByRestaurant();
    const counted = new Map<string, { quantity: number; orderCount: number }>();
    for (const stat of this.salesStats()) {
      counted.set(`${stat.restaurantId}/${stat.menuItemId}`, {
        quantity: stat.quantity,
        orderCount: stat.orderCount,
      });
    }

    const out: Record<string, readonly TopDish[]> = {};
    for (const restaurant of this.featured()) {
      const menu = menus[restaurant.id] ?? [];
      const sales = new Map<string, { quantity: number; orderCount: number }>();
      for (const item of menu) {
        const hit = counted.get(`${restaurant.id}/${item.id}`);
        if (hit) {
          sales.set(item.id, hit);
        }
      }
      out[restaurant.id] = pickTopDishes(menu, sales, TOP_DISHES_PER_RESTAURANT);
    }
    return out;
  });

  /** Cart quantities as a plain record so the row component stays presentational. */
  protected readonly cartQuantities = computed(() => {
    const lookup = this.cart.quantityOf();
    const record: Record<string, number> = {};
    for (const menu of Object.values(this.menusByRestaurant())) {
      for (const item of menu) {
        const quantity = lookup(item.id);
        if (quantity > 0) {
          record[item.id] = quantity;
        }
      }
    }
    return record;
  });

  /**
   * Adjusts a most-sold row's quantity in the global cart.
   *
   * Mirrors the restaurant detail page's `changeQuantity` deliberately: `add`
   * inserts while `setQuantity` only updates, and a cross-restaurant add
   * resets the cart with the same toast rather than silently discarding items.
   * Two places implementing this differently is how carts get mysteriously
   * emptied, so this stays a copy of that logic rather than a new invention.
   */
  protected changeQuantity(
    item: MenuItem,
    restaurant: Pick<RestaurantSummary, 'id' | 'name'>,
    next: number,
  ): void {
    const currentQuantity = this.cart.quantityOf()(item.id);
    const isSwitchingRestaurant =
      currentQuantity === 0 && !this.cart.isEmpty() && this.cart.restaurantId() !== restaurant.id;

    if (next > currentQuantity) {
      this.cart.add(
        {
          menuItemId: item.id,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
          imageUrl: item.imageUrl,
        },
        next - currentQuantity,
      );
    } else {
      this.cart.setQuantity(item.id, next);
    }

    if (isSwitchingRestaurant) {
      this.toast.info(`Started a new cart for ${restaurant.name}.`);
    }
  }

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
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-biryani.jpg?alt=media&token=fd425329-8e37-42d7-b6dc-6195d1e56fcb',
      imageCredit: 'Hyderabadi Chicken Biryani — Garrett Ziegler (CC BY 2.0)',
    },
    {
      name: 'Pizza',
      emoji: '🍕',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-pizza.jpg?alt=media&token=982ce817-e003-4c45-9f0e-58ac18762eb5',
      imageCredit: 'Pizza Margherita — jeffreyw (CC BY 2.0)',
    },
    {
      name: 'Burgers',
      emoji: '🍔',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-burgers.jpg?alt=media&token=d0619a2f-28f2-497a-af58-98624490ae74',
      imageCredit: 'Crown Burger Plus hamburger and fries — Max Slowik (CC BY 2.0)',
    },
    {
      name: 'Desserts',
      emoji: '🍰',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-desserts.jpg?alt=media&token=88c75d82-eac4-435f-8145-08fa647287a5',
      imageCredit: 'Piece of chocolate cake — Daria Yakovleva (CC0)',
    },
    {
      name: 'Chinese',
      emoji: '🥡',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-chinese.jpg?alt=media&token=c2e7e224-1005-4779-a596-aed56ca83bf1',
      imageCredit: 'Dim Sum Breakfast — afterdog (CC0)',
    },
    {
      name: 'South Indian',
      emoji: '🥞',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-south-indian.jpg?alt=media&token=f32ab695-72cf-430b-b10d-c2df6ffe820f',
      imageCredit: 'Dosa-chutney-sambhar — Roland (CC BY 2.0)',
    },
    {
      name: 'North Indian',
      emoji: '🍲',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-north-indian.jpg?alt=media&token=6a7a523c-aff0-4833-a979-af77752cd5fe',
      imageCredit: 'Vegetarian Curry — GracinhaMarco Abundo (CC BY 2.0)',
    },
    {
      name: 'Street Food',
      emoji: '🌭',
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/zaika-hub-prod.firebasestorage.app/o/images%2Fcatalog%2Fcuisines%2Fcuisine-street-food.jpg?alt=media&token=7af05026-ac0b-4d2b-8fba-cc3e92df4504',
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
