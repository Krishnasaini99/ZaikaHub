import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';

import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';

import { appRoutes } from '../../app.routes';
import { environment } from '../../../environments/environment';
import { provideImageStorage } from '../services/image-storage.provider';
import { SeoTitleStrategy } from '../services/seo-title.strategy';

/**
 * Fails loudly and early when the environment file still holds placeholders.
 *
 * Firebase's `initializeApp` does not validate its config, so a forgotten
 * `environment.ts` would otherwise surface much later as a blank page and an
 * `auth/invalid-api-key` in the console — with nothing pointing at the cause.
 */
function assertConfigured(): void {
  const placeholders = Object.entries(environment.firebase).filter(([, value]) =>
    value.startsWith('REPLACE_WITH_'),
  );

  if (placeholders.length > 0) {
    const keys = placeholders.map(([key]) => key).join(', ');
    throw new Error(
      `Firebase is not configured. Replace the placeholder values for: ${keys}\n` +
        `Edit ${environment.production ? 'environment.production.ts' : 'environment.ts'} — ` +
        `Firebase console → Project settings → Your apps.`,
    );
  }
}

/**
 * Root application providers.
 *
 * Every Firebase SDK is initialised exactly once here and injected through
 * Angular DI, so no feature code ever imports `firebase/*` directly.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Replaces Angular's default so route `data.seo` drives titles, meta
    // descriptions, canonicals, Open Graph and JSON-LD — see SeoTitleStrategy.
    { provide: TitleStrategy, useClass: SeoTitleStrategy },

    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),

    // --- Firebase --------------------------------------------------------
    provideFirebaseApp(() => {
      assertConfigured();
      return initializeApp(environment.firebase);
    }),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),

    // --- Image backend ---------------------------------------------------
    // Cloudinary by default: Firebase moved Cloud Storage behind the Blaze
    // (billing) plan. Switch `imageProvider` in `environment.ts` to go back.
    provideImageStorage(),
  ],
};
