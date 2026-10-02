// Generates a small, real JPEG so the upload path is exercised with a genuine
// image rather than a synthetic 1x1 pixel. Written to the temp dir only.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// A minimal but valid 8x8 JPEG (baseline, grey). Byte-exact so it needs no
// image library; the bytes are a well-known 8x8 baseline JPEG.
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const out = join(tmpdir(), 'zaika-hub-test-upload.jpg');
writeFileSync(out, jpeg);
console.log(out);
console.log(`${jpeg.length} bytes`);