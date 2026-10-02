/**
 * Image storage contract.
 *
 * The app never talks to a storage backend directly — it depends on this
 * interface, and the concrete backend is chosen at startup from
 * `environment.imageProvider`.
 *
 * Why this exists: Firebase moved Cloud Storage behind the Blaze (billing)
 * plan, so this project can run entirely free on Cloudinary instead. Keeping
 * the choice behind a token means switching backends later is a one-line
 * change in `environment.ts` rather than a rewrite — see the README.
 */

export type UploadFolder = 'restaurants' | 'menu-items' | 'avatars';

export interface UploadResult {
  /** Publicly fetchable URL. Stored on the Firestore document and bound to `img[src]`. */
  readonly url: string;
}

/**
 * Backend-agnostic image storage.
 *
 * Implementations must not leak provider-specific errors: callers only ever
 * see the {@link ImageStorageError} below, so the UI stays identical no
 * matter which backend is configured.
 */
export interface ImageStorage {
  /**
   * Uploads an image and resolves with its public URL.
   *
   * @param folder   namespace, e.g. `restaurants`
   * @param ownerId  scopes the upload to an owner; Firebase uses it as a path
   *                segment and for authorisation, Cloudinary uses it as a
   *                folder name
   * @param file     file from an `<input type="file">`
   */
  upload(folder: UploadFolder, ownerId: string, file: File): Promise<string>;

  /**
   * Upload with 0–100 progress reporting.
   *
   * The plain {@link upload} path is preferred where possible; this exists for
   * the owner forms that show a progress bar.
   */
  uploadWithProgress(
    folder: UploadFolder,
    ownerId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<string>;
}

/** Error carrying a safe, user-facing message. */
export class ImageStorageError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid-file' | 'too-large' | 'network' | 'rejected' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'ImageStorageError';
  }
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Client-side validation shared by every backend — a cheap first line of
 * defence before a network round trip.
 *
 * Cloudinary raises its own limits too (10 MB free plan), but rejecting early
 * gives a consistent message and avoids uploading bytes that will be refused.
 */
export function assertUploadable(file: File): void {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ImageStorageError('Please choose a JPG, PNG, WebP or AVIF image.', 'invalid-file');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageStorageError('Image must be smaller than 5 MB.', 'too-large');
  }
}

/** Kebab-cased, path-safe, collision-resistant filename. */
export function uniqueFileName(file: File): string {
  const extension = (file.name.split('.').pop() ?? 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
  const base =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'image';
  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${random}.${extension || 'jpg'}`;
}

/**
 * Reports progress for a `fetch`-based upload.
 *
 * `fetch` cannot report upload progress natively, so this walks an estimated
 * curve while the request is in flight and lands on 100 when it resolves. That
 * is an honest approximation rather than real byte counts, and it is why the
 * Firebase implementation still exists — it uses `uploadBytesResumable` and can
 * report exact progress.
 */
export function simulateProgress(onProgress: (percent: number) => void): {
  tick: () => void;
  done: () => void;
} {
  let percent = 0;
  const step = () => {
    // Approach 90 asymptotically so the bar never appears to stall at a value.
    percent = Math.min(90, percent + Math.max(4, (90 - percent) * 0.18));
    onProgress(Math.round(percent));
  };
  const timer = setInterval(step, 180);
  return {
    tick: step,
    done: () => {
      clearInterval(timer);
      onProgress(100);
    },
  };
}