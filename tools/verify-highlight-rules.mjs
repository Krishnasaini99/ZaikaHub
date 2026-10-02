/**
 * Confirms the `highlightDishes` rules are deployed in the intended state:
 * public read, and writes refused for anonymous clients.
 *
 * The seeding of that collection required a temporarily widened rule; this is the
 * check that the widening was reverted rather than left in place.
 *
 * Run: node tools/verify-highlight-rules.mjs
 */
import { initializeApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';
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

const dishes = await getDocs(collection(firestore, 'highlightDishes'));
console.log(`anonymous read : ${dishes.size} dishes (expected > 0)`);

if (dishes.size === 0) {
  console.log('FAIL: collection is empty');
  process.exit(1);
}

const sample = dishes.docs[0].data();
console.log(`sample         : ${sample.name} (${sample.restaurantName}) rank=${sample.rank}`);
console.log(`  image        : ${sample.imageUrl ? 'present' : 'MISSING'}`);
console.log(`  credit       : ${sample.imageCredit ? 'present' : 'MISSING'}`);

const probeId = `rule-probe-${Date.now()}`;
try {
  await setDoc(doc(firestore, 'highlightDishes', probeId), { rank: 999 });
  await deleteDoc(doc(firestore, 'highlightDishes', probeId));
  console.log('anonymous write: ALLOWED  <-- rules are still open, this is a leak');
  process.exit(1);
} catch (error) {
  console.log(`anonymous write: ${error.code} (correctly refused)`);
}

console.log('\nPASS');
process.exit(0);