// Dumps every image URL the production catalogue references, decoded into the
// Storage object path it points at, so the local copies in tools/food-images
// can be matched back one-to-one. Read-only: production reads are public and
// nothing here writes.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'fake', projectId: 'zaika-hub-prod' });
const db = getFirestore(app);

const urls = new Map(); // url -> { kind, id }
const note = (url, kind, id) => {
  if (url) urls.set(url, { kind, id });
};

const rests = await getDocs(collection(db, 'restaurants'));
for (const r of rests.docs) {
  const d = r.data();
  note(d.coverImageUrl, 'cover', r.id);
  note(d.logoImageUrl, 'logo', r.id);
  const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
  for (const m of menu.docs) note(m.data().imageUrl, 'dish', m.data().name ?? r.id);
}
const hl = await getDocs(collection(db, 'highlightDishes'));
for (const h of hl.docs) note(h.data().imageUrl, 'highlight', h.id);

// Admin-owned extras: site copy (hero video poster?) and cuisine tiles.
for (const [col, kind] of [
  ['siteContent', 'site'],
  ['cuisineTiles', 'tile'],
]) {
  const snaps = await getDocs(collection(db, col));
  for (const s of snaps.docs) {
    const d = s.data();
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'string' && v.startsWith('http')) note(v, kind, `${s.id}.${k}`);
    }
  }
}

console.log(`distinct URLs: ${urls.size}`);
for (const [url, meta] of urls) {
  let path = '(not storage)';
  if (url.includes('firebasestorage')) {
    const m = /\/o\/([^?]+)/.exec(url);
    path = m ? decodeURIComponent(m[1]) : url;
  }
  console.log(`${strings(meta)}\t${path}`);
}

function strings(meta) {
  return `${meta.kind}\t${meta.id}`;
}
process.exit(0);
