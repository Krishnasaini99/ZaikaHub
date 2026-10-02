import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

import { environment } from '../../../environments/environment';
import { CloudinaryImageStorageService, CLOUDINARY_SETTINGS } from './cloudinary-image-storage.service';
import { ImageStorage } from './image-storage';
import { FirebaseImageStorageService } from './firebase-image-storage.service';

/**
 * Injection token for the active image backend.
 *
 * Components inject this rather than a concrete class, so switching providers
 * is a one-line change in `environment.ts` and never touches a component.
 */
export const IMAGE_STORAGE = new InjectionToken<ImageStorage>('IMAGE_STORAGE');

/**
 * Chooses the image backend from `environment.imageProvider`.
 *
 * Firebase Storage is the fallback so a clone with no Cloudinary credentials
 * still runs; set `imageProvider: 'cloudinary'` to switch. The Cloudinary
 * settings are validated eagerly so a missing cloud name fails at startup with
 * a pointed message rather than on the owner's first upload.
 */
export function provideImageStorage(): EnvironmentProviders {
  if (environment.imageProvider === 'cloudinary') {
    return makeEnvironmentProviders([
      { provide: CLOUDINARY_SETTINGS, useFactory: readCloudinarySettings },
      { provide: IMAGE_STORAGE, useClass: CloudinaryImageStorageService },
    ]);
  }
  return makeEnvironmentProviders([
    { provide: IMAGE_STORAGE, useClass: FirebaseImageStorageService },
  ]);
}

function readCloudinarySettings() {
  const config = environment.cloudinary;
  const missing = [
    config.apiKey.startsWith('REPLACE_WITH_') ? 'apiKey' : null,
    config.cloudName.startsWith('REPLACE_WITH_') ? 'cloudName' : null,
    config.uploadPreset.startsWith('REPLACE_WITH_') ? 'uploadPreset' : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Cloudinary is the selected image provider but ${missing.join(', ')} ` +
        `${missing.length > 1 ? 'are' : 'is'} still placeholders.\n` +
        `Edit src/environments/environment.ts — Cloudinary console → Settings shows the ` +
        `Cloud name and API key; Settings → Upload → Upload presets gives the preset name.\n` +
        `Use the API key, never the API secret — the secret must not ship to the browser.`,
    );
  }

  return { apiKey: config.apiKey, cloudName: config.cloudName, uploadPreset: config.uploadPreset };
}