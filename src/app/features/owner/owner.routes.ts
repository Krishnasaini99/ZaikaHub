import { Routes } from '@angular/router';

/** Restaurant-owner panel, lazily loaded behind `authGuard` + `roleGuard`. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./owner-restaurants/owner-restaurants.component').then((m) => m.OwnerRestaurantsComponent),
    title: 'My restaurants | ZaikaHub',
  },
  {
    path: 'restaurants/:restaurantId/menu',
    loadComponent: () =>
      import('./owner-menu/owner-menu.component').then((m) => m.OwnerMenuComponent),
    title: 'Manage menu | ZaikaHub',
  },
  {
    path: 'restaurants/:restaurantId/orders',
    loadComponent: () =>
      import('./owner-orders/owner-orders.component').then((m) => m.OwnerOrdersComponent),
    title: 'Restaurant orders | ZaikaHub',
  },
];
