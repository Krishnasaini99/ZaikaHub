/**
 * Which image backend the app is pointed at.
 *
 * Lives in its own file on purpose. `angular.json` swaps `environment.ts` for
 * `environment.production.ts` at build time, so anything one of those files
 * imports from *the other* becomes a self-import in the production build and
 * fails with a circular-alias error. A third module sidesteps that entirely.
 *
 * Both backends are implemented (see `image-storage.provider.ts`); Firebase
 * Storage is the default since the project moved to the Blaze plan, and
 * Cloudinary remains selectable for a clone that wants to stay on the free
 * plan and avoid a credit card.
 */
export type ImageProvider = 'firebase' | 'cloudinary';