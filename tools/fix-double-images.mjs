// Collapses the doubled path segment the restore script introduced.
//
// storagePathOf() already returned a path that begins with `images/`, and
// toHostingUrl() prefixed `/images/` again — so every rewritten Firestore URL
// reads /images/images/catalog/..., while the copy step put the files at
// /images/catalog/... . The files are fine; only the URLs need the extra
// segment removed. Run right after restore-images-to-hosting.mjs.
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
});
const db = getFirestore(app);

const broken = (url) => typeof url === 'string' && url.includes('/images/images/');

async function repair() {
  let fixed = 0;
  for (const r of (await getDocs(collection(db, 'restaurants'))).docs) {
    const d = r.data();
    const patch = {};
    for (const key of ['coverImageUrl', 'logoImageUrl']) {
      if (broken(d[key])) {
        patch[key] = d[key].replace('/images/images/', '/images/');
        fixed += 1;
      }
    }
    if (Object.keys(patch).length > 0) {
      await setDoc(doc(db, 'restaurants', r.id), patch, { merge: true });
    }
    const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
    for (const m of menu.docs) {
      const d2 = m.data();
      if (broken(d2.imageUrl)) {
        await setDoc(doc(db, 'restaurants', r.id, 'menuItems', m.id), {
          imageUrl: d2.imageUrl.replace('/images/images/', '/images/'),
        }, { merge: true });
        fixed += 1;
      }
    }
  }
  for (const h of (await getDocs(collection(db, 'highlightDishes'))).docs) {
    const d = h.data();
    if (broken(d.imageUrl)) {
      await setDoc(doc(db, 'highlightDishes', h.id), {
        imageUrl: d.imageUrl.replace('/images/images/', '/images/'),
      }, { merge: true });
      fixed += 1;
    }
  }
  return fixed;
}

await signInWithEmailAndPassword(getAuth(app), 'owner@zaikahub.app', 'Owner12345');
const fixed = await repair();
console.log(`fixed doubled paths: ${fixed}`);
process.exit(0);
