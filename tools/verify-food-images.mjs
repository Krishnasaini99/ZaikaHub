/**
 * Verifies that the food images referenced by Firestore actually resolve.
 *
 * Requests are paced several seconds apart on purpose: Cloudinary's CDN answers
 * with a 404 — rather than a 429 — while it is throttling a client that asks for
 * too much too quickly. Unpaced checks therefore report perfectly good images as
 * broken, which is exactly the wrong conclusion to draw.
 *
 * Run: node tools/verify-food-images.mjs
 */
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const firebaseBlock = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const field = (key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(firebaseBlock)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
  storageBucket: field('storageBucket'),
  messagingSenderId: field('messagingSenderId'),
  appId: field('appId'),
});

const firestore = getFirestore(app);

/** Seconds between requests. Comfortably above the CDN's burst threshold. */
const PACE_MS = 3_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check(url) {
  const response = await fetch(url);
  const body = Buffer.from(await response.arrayBuffer());
  // A real JPEG starts FFD8FF; an HTML error page starts with '<'.
  const isJpeg = body.subarray(0, 3).toString('hex') === 'ffd8ff';
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    bytes: body.length,
    ok: response.ok && isJpeg,
  };
}

async function main() {
  const restaurantSnapshot = await getDocs(collection(firestore, 'restaurants'));
  const targets = [];

  for (const restaurant of restaurantSnapshot.docs) {
    const data = restaurant.data();
    targets.push([`${restaurant.id} cover`, data.coverImageUrl]);
    targets.push([`${restaurant.id} logo`, data.logoImageUrl]);

    const menuSnapshot = await getDocs(collection(firestore, 'restaurants', restaurant.id, 'menuItems'));
    for (const item of menuSnapshot.docs) {
      if (item.data().imageUrl) {
        targets.push([`${restaurant.id}/${item.data().name}`, item.data().imageUrl]);
      }
    }
  }

  let failures = 0;
  for (const [label, url] of targets) {
    if (!url) {
      console.log(`MISSING  ${label}`);
      failures += 1;
      continue;
    }
    const result = await check(url);
    console.log(
      `${result.ok ? 'OK  ' : 'BAD '} ${String(result.status).padEnd(4)} ${String(result.bytes).padStart(7)}B  ${label}`,
    );
    if (!result.ok) {
      failures += 1;
    }
    await sleep(PACE_MS);
  }

  console.log(`\n${targets.length - failures}/${targets.length} image URLs resolve`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('failed:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});