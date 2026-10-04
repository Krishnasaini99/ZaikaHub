import { Injectable, inject } from '@angular/core';
import { Storage, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from '@angular/fire/storage';

import { toUserError } from '../utils/firebase-error.util';
import { ImageStorage, UploadFolder, assertUploadable, uniqueFileName } from './image-storage';

/**
 * Firebase Storage implementation of {@link ImageStorage} — the default since
 * the project moved to the Blaze plan and the photo catalogue was migrated off
 * Cloudinary.
 *
 * Paths are namespaced per folder and filenames are sanitised, so a malicious
 * upload cannot escape its prefix or overwrite a sibling's asset. Download URLs
 * are returned (not storage paths) because the UI binds them straight into
 * `img[src]`.
 *
 * The site-wide catalogue (covers, dishes, cuisine tiles) is *not* written
 * through this class: it lives under `images/catalog/` and is locked to
 * admin-only writes in `storage.rules`, because those files ship with the site
 * rather than being user content. Owner uploads use `images/{folder}/{uid}/`.
 *
 * The Cloudinary implementation is kept alongside this one so a clone on the
 * free plan can avoid a credit card by flipping `imageProvider` back.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseImageStorageService implements ImageStorage {
  private readonly storage = inject(Storage);

  async upload(folder: UploadFolder, ownerId: string, file: File): Promise<string> {
    assertUploadable(file);
    return this.uploadToPath(`images/${folder}/${ownerId}/${uniqueFileName(file)}`, file);
  }

  /** Uploads to an explicit path. Used by the seeder and bulk-import flows. */
  async uploadToPath(path: string, file: File | Blob): Promise<string> {
    try {
      const snapshot = await uploadBytes(ref(this.storage, path), file, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public,max-age=31536000,immutable',
      });
      return await getDownloadURL(snapshot.ref);
    } catch (error) {
      throw toUserError(error);
    }
  }

  /**
   * Resumable variant for large files, exposing exact progress.
   * The plain `uploadBytes` path is preferred for images because a 5 MB cap
   * makes resume pointless.
   */
  uploadWithProgress(
    folder: UploadFolder,
    ownerId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<string> {
    assertUploadable(file);
    const path = `images/${folder}/${ownerId}/${uniqueFileName(file)}`;
    return new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(ref(this.storage, path), file, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public,max-age=31536000,immutable',
      });
      task.on(
        'state_changed',
        (snapshot) => {
          const percent = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          onProgress(percent);
        },
        (error) => reject(toUserError(error)),
        async () => {
          try {
            resolve(await getDownloadURL(task.snapshot.ref));
          } catch (error) {
            reject(toUserError(error));
          }
        },
      );
    });
  }
}