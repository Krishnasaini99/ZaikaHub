/**
 * Vitest global setup.
 *
 * Two things are needed before any Angular-aware test can run:
 *
 * 1. The JIT compiler. Angular ships its libraries as partially-compiled code,
 *    so an injectable that is actually instantiated — rather than merely
 *    referenced — needs `@angular/compiler` present.
 *
 * 2. A TestBed environment. Without `initTestEnvironment`, anything that calls
 *    `TestBed.inject()` fails with NG0200/"Need to call initTestEnvironment
 *    first". Angular's CLI wires this up for you in a generated setup file;
 *    doing it here keeps the same behaviour for a hand-rolled Vitest setup.
 */
import '@angular/compiler';
// The app is zone-based (`provideZoneChangeDetection` in `appConfig`), and
// `initTestEnvironment` builds an NgZone, which throws NG0908 without this.
import 'zone.js';
import 'zone.js/testing';

import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

const testBed = getTestBed();

// `setupFiles` is evaluated more than once per worker, and `initTestEnvironment`
// throws if the environment already exists. The guard is what makes this
// idempotent rather than a source of intermittent "already been instantiated"
// failures that depend on how the runner shards the suite.
if (!(testBed as unknown as { _initialized: boolean })._initialized) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    // Each test gets a fresh document, so specs that mutate <head> cannot leak
    // tags into the next test.
    teardown: { destroyAfterEach: true },
  });
}