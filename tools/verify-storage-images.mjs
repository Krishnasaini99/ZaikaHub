import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'fake', projectId: 'zaika-hub-prod' });
const db = getFirestore(app);

const urls = new Set();
const rests = await getDocs(collection(db, 'restaurants'));
for (const r of rests.docs) {
  const d = r.data();
  if (d.coverImageUrl) urls.add(d.coverImageUrl);
  if (d.logoImageUrl) urls.add(d.logoImageUrl);
  const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
  for (const m of menu.docs) if (m.data().imageUrl) urls.add(m.data().imageUrl);
}
const hl = await getDocs(collection(db, 'highlightDishes'));
for (const h of hl.docs) if (h.data().imageUrl) urls.add(h.data().imageUrl);

const onCloudinary = [...urls].filter((u) => u.includes('cloudinary')).length;
const onStorage = [...urls].filter((u) => u.includes('firebasestorage')).length;
console.log(`production image URLs: ${urls.size} total | storage ${onStorage} | cloudinary ${onCloudinary}`);

let bad = 0;
for (const u of urls) {
  try {
    const r = await fetch(u, { method: 'HEAD' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) {
      console.log(`  FAIL ${r.status} ${type} ${u.slice(-60)}`);
      bad += 1;
    }
  } catch (e) {
    console.log(`  ERR ${u.slice(-60)} ${e.message}`);
    bad += 1;
  }
  await new Promise((r) => setTimeout(r, 700));
}

// Hardcoded source URLs too. The pattern must run to the closing quote rather
// than stopping at `.jpg`: a Firebase download URL carries `?alt=media&token=…`,
// and without it Storage answers with a JSON metadata document instead of the
// image bytes — which reads as a broken image but is really a broken URL.
for (const file of ['src/index.html', 'src/app/features/home/home.component.ts']) {
  for (const m of readFileSync(file, 'utf8').matchAll(/https:\/\/[^'"\s]+/g)) {
    if (!/\.(?:jpg|jpeg|png|webp)(?:\?|$)/.test(m[0])) {
      continue;
    }
    try {
      const r = await fetch(m[0], { method: 'HEAD' });
      const type = r.headers.get('content-type') || '';
      const ok = r.ok && (type.startsWith('image/') || type.includes('xml'));
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${file} ${r.status} ${type.slice(0, 20)} ${m[0].slice(-52)}`);
      if (!ok) bad += 1;
    } catch (e) {
      console.log(`  ERR ${file} ${m[0].slice(-52)} ${e.message}`);
      bad += 1;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

console.log(bad === 0 ? `ALL ${urls.size} PRODUCTION IMAGE URLS OK` : `${bad} PROBLEMS`);
process.exit(0);