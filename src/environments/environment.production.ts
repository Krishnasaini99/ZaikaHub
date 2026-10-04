import type { ImageProvider } from './image-provider';

/**
 * Production environment — swapped in by the `fileReplacements` entry in
 * `angular.json` for `--configuration production`.
 */
export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyC6IeniDh1260iJiLOi3KDtCSUveBVWGT8',
    authDomain: 'zaika-hub-prod.firebaseapp.com',
    projectId: 'zaika-hub-prod',
    storageBucket: 'zaika-hub-prod.firebasestorage.app',
    messagingSenderId: '442698702',
    appId: '1:442698702:web:c2cdeea36227e03dd0f99f',
  },
  // Never point the production bundle at emulators.
  useEmulators: false,

  /**
   * Public origin, used to build absolute URLs for canonical links, Open Graph
   * tags and the sitemap. Kept in step with the `Hosting` URL in the Firebase
   * console — if the site ever moves, this is the one line to change.
   */
  siteUrl: 'https://zaika-hub-prod.web.app',

  /**
   * Image backend.
   *
   * `firebase` since the project moved to the Blaze plan and the whole
   * catalogue was migrated off Cloudinary: one vendor for both storage and
   * database, and image bytes on the same plan as the data that references
   * them. `cloudinary` is still a valid value and its implementation is kept
   * intact, so a clone that wants to stay on the free plan and avoid a credit
   * card can flip this one line back.
   */
  imageProvider: 'firebase' as ImageProvider,

  cloudinary: {
    apiKey: '616588295471846',
    cloudName: 'wvw3fzud',
    uploadPreset: 'zaika_hub',
  },
} as const;
