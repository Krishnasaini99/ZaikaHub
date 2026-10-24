import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateService } from './app-update.service';
import { ToastService } from './toast.service';

type SwEvent = { type: string };

type SwStub = {
  isEnabled: boolean;
  versionUpdates: Subject<SwEvent>;
  unrecoverable: Subject<{ type: string; reason: string }>;
  checkForUpdate: () => Promise<boolean>;
};

const READY_EVENT: SwEvent = { type: 'VERSION_READY' };
const DOWNLOAD_EVENT: SwEvent = { type: 'VERSION_INSTALLED' };
const BROKEN_EVENT = { type: 'UNRECOVERABLE_STATE', reason: 'two incompatible versions' };

function makeSwStub(isEnabled: boolean): SwStub {
  return {
    isEnabled,
    versionUpdates: new Subject<SwEvent>(),
    unrecoverable: new Subject<{ type: string; reason: string }>(),
    checkForUpdate: vi.fn().mockResolvedValue(false),
  };
}

describe('AppUpdateService', () => {
  let sw: SwStub;
  let toast: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  // The watcher attaches in the constructor — the service self-starts the way it
  // will in production, so each test exercises the real boot path.
  function bootService(): AppUpdateService {
    TestBed.overrideProvider(SwUpdate, { useValue: sw }).overrideProvider(ToastService, {
      useValue: toast,
    });
    return TestBed.inject(AppUpdateService);
  }

  beforeEach(() => {
    sw = makeSwStub(true);
    toast = { info: vi.fn(), error: vi.fn() };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('stays completely silent when no worker is running', () => {
    sw.isEnabled = false;
    bootService();

    expect(sw.checkForUpdate).not.toHaveBeenCalled();

    // The worker contract says updates cannot happen without a worker, but the
    // subject is the same one a real one would use — emitting on it asserts the
    // subscriptions were never opened, not just that none fired yet.
    sw.versionUpdates.next(READY_EVENT);
    sw.unrecoverable.next(BROKEN_EVENT);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('probes for an update as soon as it boots', () => {
    bootService();

    expect(sw.checkForUpdate).toHaveBeenCalledOnce();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('raises the refresh toast once a new version is ready', () => {
    bootService();

    sw.versionUpdates.next(READY_EVENT);

    expect(toast.info).toHaveBeenCalledOnce();
    expect(String(toast.info.mock.calls[0][0])).toContain('refresh');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores worker events that are not a ready version', () => {
    bootService();

    sw.versionUpdates.next({ type: 'VERSION_DETECTED' });
    sw.versionUpdates.next(DOWNLOAD_EVENT);

    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('asks for a manual reload when the worker hits an unrecoverable state', () => {
    bootService();

    sw.unrecoverable.next(BROKEN_EVENT);

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
