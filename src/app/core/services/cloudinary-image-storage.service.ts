import { Injectable, InjectionToken, inject } from '@angular/core';

import {
  ImageStorage,
  ImageStorageError,
  UploadFolder,
  assertUploadable,
  simulateProgress,
  uniqueFileName,
} from './image-storage';

/** Cloudinary credentials, validated at startup by the provider factory. */
export interface CloudinarySettings {
  /**
   * Public API key. Required even for unsigned uploads — it appears in the
   * upload URL, which is exactly why it is safe to ship to the browser. The
   * API **secret** is never needed here and must never be committed.
   */
  readonly apiKey: string;
  readonly cloudName: string;
  readonly uploadPreset: string;
}

export const CLOUDINARY_SETTINGS = new InjectionToken<CloudinarySettings>('CLOUDINARY_SETTINGS');

interface CloudinaryUploadResponse {
  readonly secure_url?: string;
  readonly error?: { readonly message?: string };
}

/**
 * Cloudinary implementation of {@link ImageStorage}.
 *
 * Uses the plain REST endpoint (`POST /v1_1/{cloud}/image/upload`) with an
 * unsigned upload preset rather than the JavaScript upload widget. The widget
 * needs a DOM container and a callback bridge, which would couple a data-layer
 * service to the view; a `fetch` keeps this provider-agnostic and testable.
 *
 * Uploads are anonymous — the client sends no secret. Safety comes from the
 * upload preset, which whitelists format, size and transformations server-side.
 * That is a weaker guarantee than Firebase's per-user authorisation, which is
 * the trade-off accepted to run without a credit card.
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryImageStorageService implements ImageStorage {
  private readonly config = inject(CLOUDINARY_SETTINGS);

  async upload(folder: UploadFolder, ownerId: string, file: File): Promise<string> {
    assertUploadable(file);
    return this.readUrl(await this.post(file, this.folderPath(folder, ownerId)));
  }

  uploadWithProgress(
    folder: UploadFolder,
    ownerId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<string> {
    assertUploadable(file);
    // `fetch` gives no upload-progress events, so the bar is driven by an
    // estimated curve and completes when the response lands. This is why the
    // Firebase implementation is kept — it reports exact bytes.
    const progress = simulateProgress(onProgress);
    return this.post(file, this.folderPath(folder, ownerId)).then(
      (response) => {
        progress.done();
        return this.readUrl(response);
      },
      (error: unknown) => {
        progress.done();
        throw error;
      },
    );
  }

  /** `zaika-hub/restaurants/<uid>` — scoped so a listing view can show one folder. */
  private folderPath(folder: UploadFolder, ownerId: string): string {
    return `zaika-hub/${folder}/${ownerId}`;
  }

  private async post(file: File, folderPath: string): Promise<CloudinaryUploadResponse> {
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', this.config.uploadPreset);
    body.append('folder', folderPath);
    // Derive a readable public id from our sanitised filename instead of
    // exposing Cloudinary's temporary upload token in the URL.
    body.append('public_id', uniqueFileName(file).replace(/\.[^.]+$/, ''));

    try {
      // `api_key` is required on the URL even for unsigned uploads; it is a
      // public identifier, not a credential. The signature is what unsigned
      // uploads deliberately skip.
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload` +
          `?api_key=${encodeURIComponent(this.config.apiKey)}`,
        { method: 'POST', body },
      );

      const payload = (await response.json()) as CloudinaryUploadResponse;

      if (!response.ok) {
        throw new ImageStorageError(
          payload.error?.message ?? 'The image was rejected by Cloudinary.',
          'rejected',
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof ImageStorageError) {
        throw error;
      }
      // A throw here means DNS/TLS/offline rather than a rejection.
      throw new ImageStorageError(
        'Could not reach the image service. Check your connection and retry.',
        'network',
      );
    }
  }

  private readUrl(response: CloudinaryUploadResponse): string {
    if (!response.secure_url) {
      throw new ImageStorageError('The image service did not return a URL.', 'unknown');
    }
    return response.secure_url;
  }
}