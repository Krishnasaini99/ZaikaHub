import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/core/firebase/firebase.config';

/*
 * Emulator wiring lives in `appConfig` (see `connectEmulatorsIfEnabled` there).
 *
 * It used to live here, calling `getAuth()`/`getFirestore()` with no arguments
 * after bootstrap. Outside an injection context those resolve against the
 * "[DEFAULT]" app, which AngularFire has not registered — so every local
 * development run died with:
 *
 *   FirebaseError: No Firebase App '[DEFAULT]' has been created
 *
 * Production never hit it because `useEmulators` is false there and the old
 * code returned early, which is exactly why the bug survived: the broken path
 * was only reachable in the one environment nobody checks against production.
 */
bootstrapApplication(App, appConfig).catch((error) => {
  // Bootstrap failures are otherwise swallowed into an empty page.
  console.error('ZaikaHub failed to start', error);
});
