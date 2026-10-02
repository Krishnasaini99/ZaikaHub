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
];
