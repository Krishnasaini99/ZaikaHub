import { Routes } from '@angular/router';

/** Listing feature routes, lazily loaded from the shell layout. */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./restaurants.component').then((m) => m.RestaurantsComponent),
    title: 'Restaurants | ZaikaHub',
    data: {
      seo: {
        title: 'Restaurants near you — order food online',
        description:
          'Browse restaurants near you. Filter by cuisine, price and rating, then order food online with live menus and fast delivery.',
        // Deliberately the clean path. Filtered views differ only by query
        // string, and indexing every combination would have this page competing
        // with itself in search results.
        path: '/restaurants',
      },
    },
  },
];