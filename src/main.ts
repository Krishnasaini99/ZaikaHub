import { bootstrapApplication } from '@angular/platform-browser';
import { connectFirestoreEmulator, getFirestore } from '@angular/fire/firestore';
import { connectAuthEmulator, getAuth } from '@angular/fire/auth';
import { connectStorageEmulator, getStorage } from '@angular/fire/storage';

import { App } from './app/app';
import { appConfig } from './app/core/firebase/firebase.config';
import { environment } from './environments/environment';

/**
 * Point every Firebase SDK at the local emulator suite when
 * `environment.useEmulators` is enabled, so development data never leaks
 * into (or gets destroyed in) the real project.
 */
function connectEmulatorsIfEnabled(): void {
  if (!environment.useEmulators) {
    return;
  }
  connectAuthEmulator(getAuth(), 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(), 'localhost', 8080);
  connectStorageEmulator(getStorage(), 'localhost', 9199);
}

bootstrapApplication(App, appConfig).then(() => {
  connectEmulatorsIfEnabled();
});
