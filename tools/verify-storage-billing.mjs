// Definitive billing check: signs in as the owner and performs a real
// round trip through Firebase Storage — upload, public read, delete.
//
// Every step is what the owner's upload flow does, so a pass here means the
// Blaze plan is genuinely active again (the suspended state failed the very
// first step with HTTP 402), not merely that the console rendered a new plan.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getMetadata,
} from 'firebase/storage';

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
  storageBucket: field('storageBucket'),
});

await signInWithEmailAndPassword(getAuth(app), 'owner@zaikahub.app', 'Owner12345');
console.log('1. owner signed in            OK');

const storage = getStorage(app);
// The exact shape the owner's upload flow writes: `images/{folder}/{uid}/…`,
// which is the only prefix storage.rules authorises for writes. A stray path
// would fail with storage/unauthorized and prove nothing about billing.
const ownerUid = 'oMelYF431FMoBMlGaN3Vx7tEjB12';
const path = `images/menu-items/${ownerUid}/billing-check-${Date.now()}.png`;
const object = ref(storage, path);
// 1x1 PNG: small enough to be a courtesy to the bucket, real image content so
// the rules' contentType check runs the same branch as an owner photo upload.
const payload = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

try {
  const uploaded = await uploadBytes(object, payload, { contentType: 'image/png' });
  console.log('2. upload                     OK  (' + uploaded.metadata.size + ' bytes)');
} catch (error) {
  console.log('2. upload                     FAIL  ' + error.code + ' — ' + error.message);
  process.exit(1);
}

const url = await getDownloadURL(object);
console.log('3. download URL               OK  ' + url.slice(0, 72) + '...');

const head = await fetch(url, { method: 'GET' });
const bytes = Buffer.from(await head.arrayBuffer());
if (!head.ok || bytes.length !== payload.length) {
  console.log('4. public read                FAIL  HTTP ' + head.status + ' bytes=' + bytes.length);
  process.exit(1);
}
console.log('4. public read                OK  (HTTP ' + head.status + ', ' + bytes.length + ' bytes matched)');

await getMetadata(object);
console.log('5. metadata read              OK');

await deleteObject(object);
console.log('6. delete                     OK');

console.log('\nSTORAGE LIVE — billing is active.');
process.exit(0);
