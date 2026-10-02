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

  /** Image backend — see the dev environment for why this is not Firebase. */
  imageProvider: 'cloudinary' as const,

  cloudinary: {
    apiKey: '616588295471846',
    cloudName: 'wvw3fzud',
    uploadPreset: 'zaika_hub',
  },
} as const;
