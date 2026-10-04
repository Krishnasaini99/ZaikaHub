/**
 * Image backends this app can be pointed at.
 *
 * Both are implemented; see `image-storage.provider.ts`. Kept as a named union
 * (rather than letting `as const` infer a single literal) so the provider can
 * branch on either without a type error when the default changes.
 */
export type ImageProvider = 'firebase' | 'cloudinary';

/**
 * Development environment.
 *
 * There is only one Firebase project (`zaika-hub-prod`). Local development is
 * kept safe by `useEmulators: true`: every read and write goes to the local
 * emulator suite, never to the real project.
 *
 * The production build swaps this file for `environment.production.ts` via the
 * `fileReplacements` entry in `angular.json`, which is the only difference
 * between the two.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyC6IeniDh1260iJiLOi3KDtCSUveBVWGT8',
    authDomain: 'zaika-hub-prod.firebaseapp.com',
    projectId: 'zaika-hub-prod',
    storageBucket: 'zaika-hub-prod.firebasestorage.app',
    messagingSenderId: '442698702',
    appId: '1:442698702:web:c2cdeea36227e03dd0f99f',
  },
  /**
   * Points every SDK at the local emulator suite. Leave this on: it is the only
   * thing separating local work from production data.
   */
  useEmulators: true,

  /**
   * Public origin, used to build absolute URLs for canonical links, Open Graph
   * tags and the sitemap. These must be absolute for crawlers — a relative URL
   * is useless to anything that is not already on the site.
   */
  siteUrl: 'https://zaika-hub-prod.web.app',

  /**
 * Image backend.
 *
 * `firebase` — the project is on the Blaze plan and the catalogue was
 * migrated onto Firebase Storage, so owner uploads and site images live in
 * the same place as the Firestore documents that reference them.
 *
 * `cloudinary` is still supported and its implementation is kept intact: a
 * clone that wants to stay on the free plan and avoid a credit card only has
 * to flip this line back. Typed as the union rather than `as const` so
 * `provideImageStorage` can keep branching on both.
 */
  imageProvider: 'firebase' as ImageProvider,

  cloudinary: {
    /** Public API key — Cloudinary console → Settings → API Keys. Not a secret. */
    apiKey: '616588295471846',
    /** Cloudinary console → Settings → Cloud name */
    cloudName: 'wvw3fzud',
    /** Cloudinary console → Settings → Upload → Upload presets → name */
    uploadPreset: 'zaika_hub',
  },
} as const;
