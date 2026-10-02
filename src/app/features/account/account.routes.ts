import { Routes } from '@angular/router';

/** Account area: profile plus saved addresses, lazily loaded. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
    title: 'My profile | ZaikaHub',
  },
  {
    path: 'addresses',
    loadComponent: () =>
      import('./addresses/addresses.component').then((m) => m.AddressesComponent),
    title: 'Saved addresses | ZaikaHub',
  },
];
