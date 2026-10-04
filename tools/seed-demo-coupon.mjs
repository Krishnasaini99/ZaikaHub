// Creates one demo coupon so the cart's apply flow can be exercised end to end.
// Only run this if you want a working code on a fresh install.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
});
await signInWithEmailAndPassword(getAuth(app), 'owner@zaikahub.app', 'Owner12345');

await setDoc(
  doc(getFirestore(app), 'coupons', 'DEMO20'),
  {
    code: 'DEMO20',
    type: 'percentage',
    value: 20,
    minOrderAmount: 200,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    maxPerUser: null,
    usageCount: 0,
    isActive: true,
    description: '20% off on orders over ₹200',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  { merge: true },
);
console.log('created DEMO20 — 20% off on orders over ₹200');
process.exit(0);