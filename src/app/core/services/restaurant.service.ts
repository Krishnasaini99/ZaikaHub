import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import {
  FulfillmentMode,
  HighlightDish,
  MenuItem,
  OpeningHours,
  PriceBand,
  Restaurant,
  RestaurantSummary,
} from '../models/restaurant.model';
import { toDate } from '../utils/date.util';
import { UserService } from './user.service';

const RESTAURANTS = 'restaurants';

/**
 * Merchandised dishes for the home page.
 *
 * A top-level collection rather than a subcollection, because a dish has to be
 * queryable across every restaurant in one read. See {@link HighlightDish}.
 */
const HIGHLIGHT_DISHES = 'highlightDishes';

/** Upper bound on the home-page strip, independent of how many are curated. */
const MAX_HIGHLIGHT_DISHES = 24;

/** Firestore is billed and limited per document read, so the listing is bounded. */
const MAX_LISTING_RESULTS = 50;

export interface CreateRestaurantInput {
  readonly name: string;
  readonly cuisines: readonly string[];
  readonly priceBand: PriceBand;
  readonly costForTwo: number;
  readonly deliveryTimeMinutes: number;
  readonly city: string;
  readonly area: string;
  readonly address: string;
  readonly modes: readonly FulfillmentMode[];
  readonly openingHours: OpeningHours;
  readonly coverImageUrl: string | null;
  readonly logoImageUrl: string | null;
}

export interface CreateMenuItemInput {
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly category: string;
  readonly isVeg: boolean;
  readonly imageUrl: string | null;
  readonly isBestseller?: boolean;
}

/**
 * Read/write access for the `restaurants` collection and its `menuItems`
 * subcollections.
 *
 * Menu items live in a subcollection so a restaurant with 200 dishes does not
 * force the home-page listing to download its whole menu.
 *
 * Query shapes are deliberately simple: Firestore offers no native "array
 * contains any of N values" beyond the single `array-contains` operator, so
 * multi-cuisine filtering happens in the feature layer over a bounded result
 * set. That is the right trade-off at demo scale; swap it for an
 * Algolia/Typesense index once the catalogue outgrows one read.
 */
@Injectable({ providedIn: 'root' })
export class RestaurantService {
  private readonly firestore = inject(Firestore);
  private readonly userService = inject(UserService);

  private restaurantsRef() {
    return collection(this.firestore, RESTAURANTS);
  }

  private restaurantDoc(id: string) {
    return doc(this.firestore, `${RESTAURANTS}/${id}`);
  }

  private menuItemsRef(restaurantId: string) {
    return collection(this.firestore, `${RESTAURANTS}/${restaurantId}/menuItems`);
  }

  private menuItemDoc(restaurantId: string, itemId: string) {
    return doc(this.firestore, `${RESTAURANTS}/${restaurantId}/menuItems/${itemId}`);
  }

  private highlightDishesRef() {
    return collection(this.firestore, HIGHLIGHT_DISHES);
  }

  // ---------------------------------------------------------------- reading

  /**
   * Live list of restaurants for the home page and the listing screen.
   *
   * A single `where('isActive', '==', true)` plus `limit` keeps the read
   * bounded and needs no composite index.
   */
  listRestaurants(): Observable<readonly RestaurantSummary[]> {
    const ref = query(this.restaurantsRef(), where('isActive', '==', true), limit(MAX_LISTING_RESULTS));
    return collectionData(ref, { idField: 'id' }).pipe(map(toSummaries));
  }

  /** Live strip of restaurants flagged as featured by an admin. */
  listFeatured(): Observable<readonly RestaurantSummary[]> {
    const ref = query(
      this.restaurantsRef(),
      where('isActive', '==', true),
      where('featured', '==', true),
      limit(12),
    );
    return collectionData(ref, { idField: 'id' }).pipe(map(toSummaries));
  }

  /** Restaurants owned by a single account (owner panel). */
  listByOwner(ownerId: string): Observable<readonly RestaurantSummary[]> {
    const ref = query(this.restaurantsRef(), where('ownerId', '==', ownerId));
    return collectionData(ref, { idField: 'id' }).pipe(map(toSummaries));
  }

  /**
   * Curated dishes for the home page strip.
   *
   * Ordered client-side on `rank` rather than by a Firestore `orderBy`: the
   * whole collection is small and bounded, so this avoids needing a composite
   * index for a list that changes only when a curator edits it.
   */
  listHighlightDishes(count = 10): Observable<readonly HighlightDish[]> {
    const ref = query(this.highlightDishesRef(), limit(MAX_HIGHLIGHT_DISHES));
    return collectionData(ref, { idField: 'id' }).pipe(
      map((docs) =>
        docs
          .map((data) => normaliseHighlightDish(data, data['id'] as string))
          .sort((a, b) => a.rank - b.rank)
          .slice(0, count),
      ),
    );
  }

  /** Full restaurant document; emits `null` when it does not exist. */
  getRestaurant(id: string): Observable<Restaurant | null> {
    return docData(this.restaurantDoc(id), { idField: 'id' }).pipe(
      map((data) => (data ? normaliseRestaurant(data, id) : null)),
    );
  }

  /** Live menu of a restaurant, ordered by the owner's `order` field. */
  listMenuItems(restaurantId: string): Observable<readonly MenuItem[]> {
    return collectionData(this.menuItemsRef(restaurantId), { idField: 'id' }).pipe(
      map((docs) =>
        docs
          .map((data) => normaliseMenuItem(data, data['id'] as string, restaurantId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  // ---------------------------------------------------------------- writing

  /**
   * Publishes a restaurant and links it to its owner's profile.
   *
   * Both writes happen here, in one place, so no caller can leave a restaurant
   * document that no profile points at. Firestore has no cross-document
   * transaction here, so a failure on the second write surfaces to the caller
   * rather than being silently swallowed.
   */
  async publishRestaurant(ownerId: string, input: CreateRestaurantInput): Promise<string> {
    const restaurantId = await this.createRestaurant(ownerId, input);
    await this.userService.linkRestaurant(ownerId, restaurantId);
    return restaurantId;
  }

  async createRestaurant(ownerId: string, input: CreateRestaurantInput): Promise<string> {
    // `doc(collection(...))` generates the id server-side; passing the
    // collection path to `doc()` would leave an odd segment count and Firestore
    // would reject the reference.
    const ref = doc(this.restaurantsRef());
    await setDoc(ref, {
      ownerId,
      name: input.name,
      slug: slugify(input.name),
      cuisines: input.cuisines,
      priceBand: input.priceBand,
      // New restaurants start unrated; they earn a rating from real reviews.
      rating: 0,
      ratingCount: 0,
      deliveryTimeMinutes: input.deliveryTimeMinutes,
      costForTwo: input.costForTwo,
      coverImageUrl: input.coverImageUrl,
      logoImageUrl: input.logoImageUrl,
      city: input.city,
      area: input.area,
      address: input.address,
      modes: input.modes,
      openingHours: input.openingHours,
      featured: false,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateRestaurant(
    id: string,
    changes: Partial<Omit<Restaurant, 'id' | 'createdAt'>>,
  ): Promise<void> {
    await updateDoc(this.restaurantDoc(id), { ...changes, updatedAt: serverTimestamp() });
  }

  /** Bulk-creates a menu in a single round trip â€” the owner form adds many rows. */
  async addMenuItems(
    restaurantId: string,
    items: readonly CreateMenuItemInput[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const batch = writeBatch(this.firestore);
    items.forEach((item, index) => {
      batch.set(doc(this.menuItemsRef(restaurantId)), {
        restaurantId,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl,
        category: item.category,
        isVeg: item.isVeg,
        isAvailable: true,
        rating: null,
        isBestseller: item.isBestseller ?? false,
        order: index,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  async updateMenuItem(
    restaurantId: string,
    itemId: string,
    changes: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'createdAt'>>,
  ): Promise<void> {
    await updateDoc(this.menuItemDoc(restaurantId, itemId), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Soft-deletes a dish by marking it unavailable, so historic order lines
   * keep resolving to a real document.
   */
  async archiveMenuItem(restaurantId: string, itemId: string): Promise<void> {
    await updateDoc(this.menuItemDoc(restaurantId, itemId), {
      isAvailable: false,
      updatedAt: serverTimestamp(),
    });
  }

  /** Irreversible delete, for dishes that were never actually sold. */
  async deleteMenuItem(restaurantId: string, itemId: string): Promise<void> {
    await deleteDoc(this.menuItemDoc(restaurantId, itemId));
  }
}

// ------------------------------------------------------------- projections

function toSummaries(docs: readonly DocumentData[]): readonly RestaurantSummary[] {
  return docs.map((data) => toSummary(normaliseRestaurant(data, data['id'] as string)));
}

function toSummary(restaurant: Restaurant): RestaurantSummary {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisines: restaurant.cuisines,
    priceBand: restaurant.priceBand,
    rating: restaurant.rating,
    ratingCount: restaurant.ratingCount,
    deliveryTimeMinutes: restaurant.deliveryTimeMinutes,
    costForTwo: restaurant.costForTwo,
    coverImageUrl: restaurant.coverImageUrl,
    area: restaurant.area,
    city: restaurant.city,
    featured: restaurant.featured,
  };
}

/**
 * Defensive projection of a Firestore document onto our model.
 *
 * Every field gets a default, so a partially written document (or one written
 * by an older app version) renders instead of throwing inside a template.
 */
export function normaliseRestaurant(data: DocumentData, id: string): Restaurant {
  return {
    id,
    ownerId: str(data, 'ownerId'),
    name: str(data, 'name', 'Unnamed restaurant'),
    slug: str(data, 'slug'),
    cuisines: strArray(data, 'cuisines'),
    priceBand: str(data, 'priceBand', 'mid') as PriceBand,
    rating: num(data, 'rating'),
    ratingCount: num(data, 'ratingCount'),
    deliveryTimeMinutes: num(data, 'deliveryTimeMinutes', 40),
    costForTwo: num(data, 'costForTwo'),
    coverImageUrl: strOrNull(data, 'coverImageUrl'),
    logoImageUrl: strOrNull(data, 'logoImageUrl'),
    city: str(data, 'city'),
    area: str(data, 'area'),
    address: str(data, 'address'),
    modes: (strArray(data, 'modes').length ? strArray(data, 'modes') : ['delivery']) as FulfillmentMode[],
    openingHours: (data['openingHours'] as OpeningHours | undefined) ?? { open: 570, close: 1380 },
    featured: bool(data, 'featured'),
    isActive: bool(data, 'isActive', true),
    // Absent on documents written before photos were credited, so it defaults
    // to null rather than an empty string the UI would still render.
    imageCredit: strOrNull(data, 'imageCredit'),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

export function normaliseHighlightDish(data: DocumentData, id: string): HighlightDish {
  return {
    id,
    restaurantId: str(data, 'restaurantId'),
    restaurantName: str(data, 'restaurantName'),
    menuItemId: str(data, 'menuItemId'),
    name: str(data, 'name'),
    description: str(data, 'description'),
    price: num(data, 'price'),
    imageUrl: strOrNull(data, 'imageUrl'),
    isVeg: bool(data, 'isVeg'),
    rank: num(data, 'rank'),
    imageCredit: strOrNull(data, 'imageCredit'),
  };
}

export function normaliseMenuItem(
  data: DocumentData,
  id: string,
  restaurantId: string,
): MenuItem {
  return {
    id,
    restaurantId: str(data, 'restaurantId', restaurantId),
    name: str(data, 'name'),
    description: str(data, 'description'),
    price: num(data, 'price'),
    imageUrl: strOrNull(data, 'imageUrl'),
    category: str(data, 'category', 'General'),
    isVeg: bool(data, 'isVeg'),
    isAvailable: bool(data, 'isAvailable', true),
    rating: (data['rating'] as number | null | undefined) ?? null,
    isBestseller: bool(data, 'isBestseller'),
    order: num(data, 'order'),
    imageCredit: strOrNull(data, 'imageCredit'),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -------------------------------------------------------- field coercions

function str(data: DocumentData, key: string, fallback = ''): string {
  const value = data[key];
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(data: DocumentData, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(data: DocumentData, key: string, fallback = 0): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(data: DocumentData, key: string, fallback = false): boolean {
  const value = data[key];
  return typeof value === 'boolean' ? value : fallback;
}

function strArray(data: DocumentData, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
