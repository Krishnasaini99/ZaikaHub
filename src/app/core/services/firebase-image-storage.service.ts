import { Injectable, inject } from '@angular/core';
import { Storage, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from '@angular/fire/storage';

import { toUserError } from '../utils/firebase-error.util';
import { ImageStorage, UploadFolder, assertUploadable, uniqueFileName } from './image-storage';

/**
 * Firebase Storage implementation of {@link ImageStorage}.
 *
 * Paths are namespaced per folder and filenames are sanitised, so a malicious
 * upload cannot escape its prefix or overwrite a sibling's asset. Download URLs
 * are returned (not storage paths) because the UI binds them straight into
 * `img[src]`.
 *
 * Not wired in by default: Firebase moved Cloud Storage behind the Blaze
 * (billing) plan, so this project uses Cloudinary instead. Kept because it is
 * the only implementation that can report true byte-level upload progress, and
 * because switching back is a one-line `imageProvider` change.
 *
 * Requires `storage.rules` to be deployed, and the project on the Blaze plan.
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