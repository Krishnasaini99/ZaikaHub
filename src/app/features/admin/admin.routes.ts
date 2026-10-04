import { Routes } from '@angular/router';

/** Admin area, lazily loaded behind `authGuard` + `roleGuard(['admin'])`. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
    title: 'Admin | ZaikaHub',
  },
  {
    // Everything the owner can change about the public site: copy, video and
    // the cuisine tiles. Split from the dashboard so neither is a long scroll.
    path: 'content',
    loadComponent: () =>
      import('./admin-content/admin-content.component').then((m) => m.AdminContentComponent),
    title: 'Site content | Admin | ZaikaHub',
  },
  {
    path: 'coupons',
    loadComponent: () =>
      import('./admin-coupons/admin-coupons.component').then((m) => m.AdminCouponsComponent),
    title: 'Coupons | Admin | ZaikaHub',
  },
  {
    path: 'prices',
    loadComponent: () =>
      import('./admin-prices/admin-prices.component').then((m) => m.AdminPricesComponent),
    title: 'Menu prices | Admin | ZaikaHub',
  },
];
