// One-shot: Wok This Way's cover photo was replaced with the spring rolls
// photograph, so the credit filed on the restaurant document has to move with
// it. Same write needs the owner account — reads alone use the fake-key
// pattern, writes cannot.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
});
await signInWithEmailAndPassword(getAuth(app), 'owner@zaikahub.app', 'Owner12345');

const db = getFirestore(app);
const credit = 'Spring rolls (1).jpg — rick from San Francisco, USA (CC BY 2.0)';

await updateDoc(doc(db, 'restaurants', 'wok-this-way'), {
  imageCredit: credit,
  updatedAt: new Date(),
});
console.log('wok-this-way imageCredit ->', credit);
process.exit(0);
