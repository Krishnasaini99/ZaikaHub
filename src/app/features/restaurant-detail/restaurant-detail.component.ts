import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { MenuItem, Restaurant } from '../../core/models/restaurant.model';
import { CartService } from '../../core/services/cart.service';
import { RestaurantService } from '../../core/services/restaurant.service';
import { SeoService } from '../../core/services/seo.service';
import { ToastService } from '../../core/services/toast.service';
import { DurationPipe } from '../../core/pipes/display.pipes';
import { formatOpeningHours, summariseList } from '../../core/utils/format.util';
import { breadcrumbJsonLd, restaurantDescription, restaurantJsonLd } from '../../core/utils/structured-data.util';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ImageCreditComponent } from '../../shared/components/image-credit.component';
import { MenuItemRowComponent } from '../../shared/components/menu-item-row.component';
import { PriceBandComponent } from '../../shared/components/price-band.component';
import { RatingBadgeComponent } from '../../shared/components/rating-badge.component';

/**
 * Restaurant detail page: cover, info header, and the menu grouped by category.
 *
 * The route param arrives as a signal input thanks to
 * `withComponentInputBinding()`. Both the restaurant and its menu are derived
 * from that signal with `switchMap`, which is what makes the page correct when
 * the user navigates straight from one restaurant to another — the previous
 * restaurant's data can never flash on screen.
 */
@Component({
  selector: 'app-restaurant-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CurrencyPipe,
    PriceBandComponent,
    RatingBadgeComponent,
    MenuItemRowComponent,
    EmptyStateComponent,
    ImageCreditComponent,
    DurationPipe,
  ],
  templateUrl: './restaurant-detail.component.html',
  styleUrl: './restaurant-detail.component.scss',
})
export class RestaurantDetailComponent {
  private readonly restaurantService = inject(RestaurantService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  /** Route param, bound by `withComponentInputBinding()`. */
  readonly restaurantId = input.required<string>();

  private readonly restaurantId$ = toObservable(this.restaurantId);

  protected readonly restaurant = toSignal(
    this.restaurantId$.pipe(switchMap((id) => this.restaurantService.getRestaurant(id))),
    { initialValue: null },
  );

  protected readonly menu = toSignal(
    this.restaurantId$.pipe(switchMap((id) => this.restaurantService.listMenuItems(id))),
    { initialValue: [] as readonly MenuItem[] },
  );

  protected readonly activeCategory = signal<string | null>(null);

  constructor() {
    // Re-runs whenever the restaurant or its menu loads, so the tags never
    // describe a page that is still showing a placeholder. Declared in the
    // constructor because `effect()` needs an injection context, and this one
    // depends on signals declared above.
    effect(() => {
      const restaurant = this.restaurant();
      if (!restaurant) {
        return;
      }
      const menu = this.menu();
      const pageUrl = this.seo.absolute(`/restaurant/${restaurant.id}`);
      // Three at most: a longer list turns the title into a comma-separated
      // run-on, which both reads badly and gets truncated mid-word.
      const cuisines = restaurant.cuisines.slice(0, 3).join(', ');

      // `restaurantDescription` owns the length budget, because a description
      // that overflows is silently truncated by Google at an arbitrary point.
      this.seo.apply({
        title: `${restaurant.name} — ${cuisines} in ${restaurant.area}`,
        description: restaurantDescription(restaurant, menu),
        path: `/restaurant/${restaurant.id}`,
        imageUrl: restaurant.coverImageUrl,
        jsonLd: [
          ...restaurantJsonLd(restaurant, menu, pageUrl, restaurant.coverImageUrl),
          ...breadcrumbJsonLd(pageUrl, [
            { name: 'ZaikaHub', path: '/' },
            { name: 'Restaurants', path: '/restaurants' },
            { name: restaurant.name, path: `/restaurant/${restaurant.id}` },
          ]),
        ],
      });
    });
  }

  protected readonly cuisinesLabel = computed(() =>
    summariseList(this.restaurant()?.cuisines ?? [], 4),
  );

  protected readonly hoursLabel = computed(() => {
    const hours = this.restaurant()?.openingHours;
    return hours ? formatOpeningHours(hours) : '';
  });

  /** Menu items grouped by category, preserving the owner's ordering. */
  private readonly grouped = computed(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of this.menu()) {
      const bucket = groups.get(item.category);
      if (bucket) {
        bucket.push(item);
      } else {
        groups.set(item.category, [item]);
      }
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  });

  protected readonly availableCategories = computed(() =>
    this.grouped().filter((group) => group.items.length > 0).map((group) => group.name),
  );

  /** `null` means "all categories". */
  protected readonly visibleCategories = computed(() => {
    const active = this.activeCategory();
    const all = this.grouped();
    return active ? all.filter((group) => group.name === active) : all;
  });

  protected readonly isEmptyMenu = computed(() => this.menu().length === 0);

  protected readonly cartQuantityFor = computed(() => this.cart.quantityOf());

  protected readonly cartCount = computed(() => this.cart.totals().itemCount);
  protected readonly cartTotal = computed(() => this.cart.totals().grandTotal);

  protected selectCategory(name: string | null): void {
    this.activeCategory.set(name);
  }

  /**
   * Adjusts a dish's quantity in the global cart.
   *
   * `add` and `setQuantity` are deliberately different: `setQuantity` only
   * *updates* lines that already exist, so the "Add" button has to go through
   * `add` to insert a dish in the first place. Calling `setQuantity` for both
   * made adding from the restaurant page silently do nothing.
   *
   * The cart is global, so this is also where a cross-restaurant conflict is
   * detected. Rather than silently discarding items, the cart is reset and the
   * user is told — matching the prompt in the real Zomato app.
   */
  protected changeQuantity(item: MenuItem, next: number): void {
    const restaurant = this.restaurant();
    if (!restaurant) {
      return;
    }

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
      // A quantity of 0 (or less) removes the line.
      this.cart.setQuantity(item.id, next);
    }

    if (isSwitchingRestaurant) {
      this.toast.info(`Started a new cart for ${restaurant.name}.`);
    }
  }

  protected async goToCart(): Promise<void> {
    await this.router.navigate(['/cart']);
  }
}
