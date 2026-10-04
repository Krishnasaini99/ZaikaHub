import { Injectable, inject } from '@angular/core';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';

import { ImageStorageError } from './image-storage';

/**
 * Uploads for the admin content tools.
 *
 * Deliberately separate from `ImageStorage`: that interface is the *user*
 * upload path used by owner forms, and it is reachable by any signed-in account
 * on its own `uid` namespace. Admin media is conceptually different — it becomes
 * part of the public site — but it is still stored under the admin's own `uid`
 * segment rather than under a shared "admin" prefix.
 *
 * WHY NOT AN ADMIN-ONLY STORAGE PATH
 * ----------------------------------
 * `firestore.rules` decides admin by reading the user's profile document, and
 * Storage rules cannot read Firestore — cross-service lookups do not exist
 * there. So a `match /admin-media/... { allow write: if isAdmin() }` rule is not
 * expressible without moving admin onto a custom claim. Writing under the
 * admin's own `uid` gives the same protection with the rules that already
 * exist: nobody else can write there, because the path segment is checked
 * against `request.auth.uid`.
 *
 * Videos get their own rule with a 50 MB ceiling (see `storage.rules`).
 */

export type AdminMediaFolder = 'site-media';

const MAX_VIDEO_BYTES = 48 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

@Injectable({ providedIn: 'root' })
export class AdminMediaService {
  private readonly storage = inject(Storage);

  /**
   * Stores an image and returns its public URL.
   *
   * Delegates to the same client-side validation the owner forms use so the
   * admin cannot upload something the site would later refuse.
   */
  async uploadImage(ownerId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new ImageStorageError('Please choose an image file.', 'invalid-file');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new ImageStorageError('Image must be smaller than 5 MB.', 'too-large');
    }
    return this.put(`images/${'site-media'}/${ownerId}/${safeName(file.name)}`, file, file.type);
  }

  /**
   * Stores a promotional video and returns its public URL.
   *
   * MP4 first in the allowed list on purpose: it is the only format every
   * browser plays, so a WebM-only clip would show a black box on iOS.
   */
  async uploadVideo(ownerId: string, file: File): Promise<string> {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      throw new ImageStorageError('Please choose an MP4, WebM or MOV video.', 'invalid-file');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new ImageStorageError('Video must be smaller than 48 MB.', 'too-large');
    }
    return this.put(`videos/${ownerId}/${safeName(file.name)}`, file, file.type);
  }

  private async put(path: string, body: Blob, contentType: string): Promise<string> {
    try {
      const snapshot = await uploadBytes(ref(this.storage, path), body, {
        contentType,
        cacheControl: 'public,max-age=31536000,immutable',
      });
      return await getDownloadURL(snapshot.ref);
    } catch (error) {
      throw new ImageStorageError(
        error instanceof Error ? error.message : 'Upload failed.',
        'network',
      );
    }
  }
}

function safeName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  const random = Math.random().toString(36).slice(2, 8);
  return `${base || 'file'}-${random}${name.includes('.') ? `.${name.split('.').pop()}` : ''}`;
}