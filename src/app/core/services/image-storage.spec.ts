import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MIME_TYPES,
  ImageStorageError,
  MAX_IMAGE_BYTES,
  assertUploadable,
  simulateProgress,
  uniqueFileName,
} from './image-storage';

function fakeFile(name: string, type: string, size = 1024): File {
  return { name, type, size } as File;
}

describe('assertUploadable', () => {
  it('accepts the supported image types', () => {
    for (const type of ALLOWED_MIME_TYPES) {
      expect(() => assertUploadable(fakeFile('a.png', type))).not.toThrow();
    }
  });

  it('rejects non-image types before any network call', () => {
    expect(() => assertUploadable(fakeFile('a.pdf', 'application/pdf'))).toThrow(ImageStorageError);
    expect(() => assertUploadable(fakeFile('a.exe', 'application/x-msdownload'))).toThrow(
      ImageStorageError,
    );
  });

  it('rejects files over the 5 MB cap', () => {
    expect(() =>
      assertUploadable(fakeFile('big.png', 'image/png', MAX_IMAGE_BYTES + 1)),
    ).toThrow(ImageStorageError);
  });

  it('allows a file exactly at the cap', () => {
    expect(() => assertUploadable(fakeFile('ok.png', 'image/png', MAX_IMAGE_BYTES))).not.toThrow();
  });

  it('reports a reason code the UI can branch on', () => {
    try {
      assertUploadable(fakeFile('big.png', 'image/png', MAX_IMAGE_BYTES + 1));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ImageStorageError).reason).toBe('too-large');
    }
  });
});

describe('uniqueFileName', () => {
  it('strips path separators and unsafe characters', () => {
    const name = uniqueFileName(fakeFile('../../etc/pa$$wd .png', 'image/png'));
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name).not.toContain('$');
    expect(name).not.toContain(' ');
  });

  it('keeps a normalised extension', () => {
    expect(uniqueFileName(fakeFile('photo.PNG', 'image/png'))).toMatch(/^[a-z0-9-]+\.png$/);
  });

  it('does not collide across identical filenames', () => {
    const a = uniqueFileName(fakeFile('dish.png', 'image/png'));
    const b = uniqueFileName(fakeFile('dish.png', 'image/png'));
    expect(a).not.toBe(b);
  });

  it('falls back to a usable name when nothing survives sanitising', () => {
    expect(uniqueFileName(fakeFile('@@@.webp', 'image/webp'))).toMatch(/^image-[a-z0-9]+\.webp$/);
  });
});

describe('simulateProgress', () => {
  it('ends at 100 and stays monotonic', () => {
    const seen: number[] = [];
    const progress = simulateProgress((p) => seen.push(p));

    // Drive it manually rather than waiting on the interval timer.
    for (let i = 0; i < 40; i += 1) {
      progress.tick();
    }
    progress.done();

    expect(seen[seen.length - 1]).toBe(100);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  it('never overshoots 100 before done', () => {
    const seen: number[] = [];
    const progress = simulateProgress((p) => seen.push(p));
    for (let i = 0; i < 200; i += 1) {
      progress.tick();
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(90);
    progress.done();
  });
});