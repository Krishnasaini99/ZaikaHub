import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';

/**
 * Route table.
 *
 * Every feature is lazily loaded so the initial bundle only carries the shell
 * plus the home page. Guards run before the feature chunk is even fetched, so
 * protected screens are never downloaded for anonymous visitors.
 *
 * Each route carries a `seo` payload consumed by `SeoTitleStrategy`. Keeping it
 * here rather than in a constructor per component means the copy, the canonical
 * path and the indexability of a page are all readable in one place.
 */
export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell-layout/shell-layout.component').then((m) => m.ShellLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
        title: 'ZaikaHub — Order food online',
        data: {
          seo: {
            title: 'Order food online from restaurants near you',
            description:
              'Order food online from restaurants near you. Biryani, pizza, Chinese, desserts and more, with live menus, ratings and delivery in as little as 25 minutes.',
            path: '/',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'ZaikaHub',
                url: 'https://zaika-hub-prod.web.app/',
                potentialAction: {
                  '@type': 'SearchAction',
                  // Lets Google offer a sitelinks search box for the brand.
                  target: {
                    '@type': 'EntryPoint',
                    urlTemplate: 'https://zaika-hub-prod.web.app/restaurants?q={search_term_string}',
                  },
                  'query-input': 'required name=search_term_string',
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'ZaikaHub',
                url: 'https://zaika-hub-prod.web.app/',
                logo: 'https://zaika-hub-prod.web.app/icon-512.png',
              },
            ],
          },
        },
      },
      {
        path: 'restaurants',
        loadChildren: () => import('./features/restaurants/restaurants.routes').then((m) => m.routes),
      },
      {
        path: 'restaurant/:restaurantId',
        loadComponent: () =>
          import('./features/restaurant-detail/restaurant-detail.component').then(
            (m) => m.RestaurantDetailComponent,
          ),
        title: 'Restaurant | ZaikaHub',
        // No `seo` payload here on purpose: the page sets its own tags from the
        // loaded restaurant (name, rating, menu, cover image) once Firestore
        // answers, which no static payload could know in advance.
      },
      {
        path: 'cart',
        canActivate: [authGuard],
        loadComponent: () => import('./features/cart/cart.component').then((m) => m.CartComponent),
        title: 'Your cart | ZaikaHub',
        data: {
          seo: {
            title: 'Your cart',
            description: 'Review the items in your ZaikaHub order before checkout.',
            path: '/cart',
            noIndex: true,
          },
        },
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent),
        title: 'Checkout | ZaikaHub',
        data: {
          seo: {
            title: 'Checkout',
            description: 'Confirm your delivery address and place your ZaikaHub order.',
            path: '/checkout',
            noIndex: true,
          },
        },
      },
      {
        path: 'orders',
        canActivate: [authGuard],
        loadComponent: () => import('./features/orders/orders.component').then((m) => m.OrdersComponent),
        title: 'My orders | ZaikaHub',
        data: {
          seo: {
            title: 'My orders',
            description: 'Track your current ZaikaHub orders and reorder from your history.',
            path: '/orders',
            noIndex: true,
          },
        },
      },
      {
        path: 'account',
        canActivate: [authGuard],
        loadChildren: () => import('./features/account/account.routes').then((m) => m.routes),
      },
    ],
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    title: 'Log in | ZaikaHub',
    data: {
      seo: {
        title: 'Log in',
        description: 'Sign in to ZaikaHub to track orders and reorder your favourites.',
        path: '/login',
        noIndex: true,
      },
    },
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
    title: 'Create account | ZaikaHub',
    data: {
      seo: {
        title: 'Create your account',
        description: 'Sign up for ZaikaHub to order food online from restaurants near you.',
        path: '/register',
        noIndex: true,
      },
    },
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
    title: 'Reset password | ZaikaHub',
    data: {
      seo: {
        title: 'Reset your password',
        description: 'Request a password reset link for your ZaikaHub account.',
        path: '/forgot-password',
        noIndex: true,
      },
    },
  },
  {
    path: 'owner',
    canActivate: [authGuard, roleGuard],
    // `customer` is deliberately allowed: publishing a restaurant is what
    // *promotes* someone to `owner`, and that can only happen from this panel.
    // Restricting it to `owner` created a deadlock where no account could ever
    // become an owner. A customer who opens this sees the "publish your first
    // restaurant" empty state instead.
    data: {
      roles: ['customer', 'owner', 'admin'],
      seo: {
        title: 'Owner dashboard',
        description: 'Publish your restaurant, manage its menu and handle incoming orders.',
        path: '/owner',
        noIndex: true,
      },
    },
    loadChildren: () => import('./features/owner/owner.routes').then((m) => m.routes),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ['admin'],
      seo: {
        title: 'Admin dashboard',
        description: 'ZaikaHub administration.',
        path: '/admin',
        noIndex: true,
      },
    },
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.routes),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
    data: {
      seo: {
        title: 'Page not found',
        description: 'That page could not be found on ZaikaHub.',
        path: '/404',
        noIndex: true,
      },
    },
  },
];