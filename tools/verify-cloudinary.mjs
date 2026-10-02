/**
 * Verifies the Cloudinary upload path end to end, without the browser.
 *
 * Mirrors what `CloudinaryImageStorageService` sends, so a green run here means
 * the cloud name, upload preset and request shape are all correct. Run with:
 *   node tools/verify-cloudinary.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const environmentSource = readFileSync(
  resolve('src/environments/environment.production.ts'),
  'utf8',
);

// Read from the `cloudinary` block only. A naive regex over the whole file picks
// up the Firebase `apiKey` first and silently tests the wrong credentials.
const cloudinaryBlock = /cloudinary:\s*\{([\s\S]*?)\n\s*\}/.exec(environmentSource)?.[1];
if (!cloudinaryBlock) {
  throw new Error('could not find the cloudinary block in environment.production.ts');
}

function readField(key) {
  const match = new RegExp(`\\b${key}:\\s*'([^']+)'`).exec(cloudinaryBlock);
  if (!match) {
    throw new Error(`could not read ${key} from the cloudinary block`);
  }
  if (match[1].startsWith('REPLACE_WITH_')) {
    throw new Error(`${key} is still a placeholder in environment.production.ts`);
  }
  return match[1];
}

const apiKey = readField('apiKey');
const cloudName = readField('cloudName');
const uploadPreset = readField('uploadPreset');

console.log(`api key     : ${apiKey.replace(/^.{6}.*/, (m) => `${m}…`)}`);
console.log(`cloud name  : ${cloudName}`);
console.log(`uploadPreset: ${uploadPreset}\n`);

/** 4×4 solid PNG — smallest thing that exercises the real upload path. */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAF0lEQVR42mP8z8BQz0AEYBxVSF+FAAsvAAsvAsvAAAtvAAsvAAAAAElFTkSuQmCC',
  'base64',
);

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'smoke-test.png');
form.append('upload_preset', uploadPreset);
form.append('folder', 'zaika-hub/smoke');
form.append('public_id', 'verify-' + Date.now());

const response = await fetch(
  `https://api.cloudinary.com/v1_1/${cloudName}/image/upload?api_key=${encodeURIComponent(apiKey)}`,
  { method: 'POST', body: form },
);

const payload = await response.json();

if (!response.ok) {
  console.error('UPLOAD FAILED');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log('UPLOAD OK');
console.log(`  public_id : ${payload.public_id}`);
console.log(`  format    : ${payload.format}`);
console.log(`  bytes     : ${payload.bytes}`);
console.log(`  secure_url: ${payload.secure_url}`);

// The URL must actually serve the bytes back, not just be returned.
const image = await fetch(payload.secure_url);
console.log(`\nGET the stored image -> ${image.status} ${image.headers.get('content-type')}`);
console.log(image.ok ? 'PASS' : 'FAIL');
process.exit(image.ok ? 0 : 1);