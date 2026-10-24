// Restores the catalogue images by serving them from Firebase Hosting.
//
// Why this exists: Google suspended the billing account (HTTP 402 on every
// Storage download), so every photograph went dark even though the files are
// still in the bucket. The originals are also checked into the repo at
// tools/food-images (credits intact), so this script copies the referenced
// variants to public/images/<same-path-as-storage> and rewrites the Firestore
// URLs to the Hosting copy — which is served from the free plan and does not
// depend on billing at all.
//
// Idempotent: URLs already pointing at the Hosting path are neither copied a
// second time nor rewritten, so the script can be run again safely.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';

const SOURCE_DIR = 'tools/food-images';
const SITE_URL = 'https://zaika-hub-prod.web.app';

// The Storage filenames were derived from the restaurant id plus geometry, so
// every live URL maps to exactly one checked-in original. The two geometry
// variants of a cover (banner and logo square) come from the same original.
const RESTAURANT_COVER_FILES = {
  'bombay-pizza-co-': 'cover-bombay-pizza.jpg',
  'burger-junction': 'cover-burger-junction.jpg',
  'chatori-galli': 'cover-chatori-galli.jpg',
  'dakshin-kitchen': 'cover-dakshin-kitchen.jpg',
  'mithai-corner': 'cover-mithai-corner.jpg',
  'seekh-roll-house': 'cover-seekh-roll-house.jpg',
  'wok-this-way': 'cover-wok-this-way.jpg',
  'zaika-house': 'cover-zaika-house.jpg',
};

// Most dish files share the Storage slug with the credit id; the entries below
// are the ones that do not — renames, shared originals (the same naan photo
// feeds two restaurants) and close near-misses.
const DISH_FILE_BY_SLUG = {
  'bombay-pizza-co--margherita': 'dish-margherita-pizza.jpg',
  'bombay-pizza-co--tandoori-paneer-pizza': 'dish-tandoori-paneer-pizza.jpg',
  'bombay-pizza-co--chicken-tikka-pizza': 'dish-chicken-tikka-pizza.jpg',
  'bombay-pizza-co--garlic-breadsticks': 'dish-garlic-breadsticks.jpg',
  'burger-junction-chocolate-milkshake': 'dish-chocolate-milkshake.jpg',
  'burger-junction-classic-cheeseburger': 'dish-cheeseburger.jpg',
  'burger-junction-peri-peri-fries': 'dish-french-fries.jpg',
  'burger-junction-veg-crispy-burger': 'dish-veg-burger.jpg',
  'chatori-galli-chole-bhature': 'dish-chole-bhature.jpg',
  'chatori-galli-pani-puri': 'dish-pani-puri.jpg',
  'chatori-galli-pav-bhaji': 'dish-pav-bhaji.jpg',
  'chatori-galli-samosa': 'dish-samosa.jpg',
  'dakshin-kitchen-filter-coffee': 'dish-filter-coffee.jpg',
  'dakshin-kitchen-idli-sambar': 'dish-idli-sambar.jpg',
  'dakshin-kitchen-masala-dosa': 'dish-masala-dosa.jpg',
  'dakshin-kitchen-medu-vada': 'dish-medu-vada.jpg',
  'mithai-corner-rasmalai': 'dish-rasmalai.jpg',
  'mithai-corner-belgian-chocolate-brownie': 'dish-brownie.jpg',
  'mithai-corner-samosa': 'dish-samosa.jpg',
  'seekh-roll-house-butter-naan': 'dish-butter-naan.jpg',
  'seekh-roll-house-chicken-seekh-kebab': 'dish-seekh-kebab.jpg',
  'seekh-roll-house-mutton-korma': 'dish-mutton-korma.jpg',
  'seekh-roll-house-tandoori-chicken': 'dish-tandoori-chicken.jpg',
  'wok-this-way-veg-manchurian': 'dish-veg-manchurian.jpg',
  'wok-this-way-chicken-hakka-noodles': 'dish-hakka-noodles.jpg',
  'wok-this-way-chilli-garlic-sauce': 'dish-chilli-garlic-sauce.jpg',
  'wok-this-way-spring-rolls': 'dish-spring-rolls.jpg',
  'zaika-house-hyderabadi-chicken-biryani': 'dish-hyderabadi-biryani.jpg',
  'zaika-house-paneer-tikka-masala': 'dish-paneer-tikka-masala.jpg',
  'zaika-house-veg-dum-biryani': 'dish-veg-dum-biryani.jpg',
  'zaika-house-butter-naan': 'dish-butter-naan.jpg',
  'zaika-house-gulab-jamun': 'dish-gulab-jamun.jpg',
  'zaika-house-butter-chicken': 'dish-butter-chicken.jpg',
};

/** Splits a Storage download URL into its object path. */
function storagePathOf(url) {
  const encoded = /\/o\/([^?]+)/.exec(url)?.[1];
  if (!encoded) throw new Error(`not a Storage URL: ${url.slice(0, 80)}`);
  return decodeURIComponent(encoded);
}

const toHostingUrl = (path) => `${SITE_URL}/images/${path}`;

const onSuspendedStorage = (url) => typeof url === 'string' && url.includes('firebasestorage.google');

/** Maps every live Storage URL to a [source file, public destination] pair. */
function planCopies(urls) {
  const jobs = new Map(); // destination -> source, so duplicates collapse
  for (const url of urls) {
    if (!onSuspendedStorage(url)) continue;
    const path = storagePathOf(url);
    const name = path.replace(/\.jpg$/, '');
    const cover = /catalog\/restaurants\/(.+)-cover-1200x500-limit$/.exec(name);
    const logo = /catalog\/restaurants\/(.+)-cover-200x200-fill$/.exec(name);
    const dish = /catalog\/menu-items\/(.+)-600x450-limit$/.exec(name);

    let source;
    if (cover) source = RESTAURANT_COVER_FILES[cover[1]];
    else if (logo) source = RESTAURANT_COVER_FILES[logo[1]];
    else if (dish) source = DISH_FILE_BY_SLUG[dish[1]];
    else throw new Error(`unexpected image path: ${path}`);

    if (!source) throw new Error(`no mapping for path ${path}`);
    const from = join(SOURCE_DIR, source);
    if (!existsSync(from)) throw new Error(`missing source file ${from}`);
    jobs.set(join('public', path), from);
  }
  return [...jobs].map(([to, from]) => ({ to, from }));
}

async function forEachImageField(db, visit) {
  for (const r of (await getDocs(collection(db, 'restaurants'))).docs) {
    const d = r.data();
    for (const key of ['coverImageUrl', 'logoImageUrl']) visit(d, `${r.id}.${key}`);
    const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
    for (const m of menu.docs) visit(m.data(), `menuItems:${r.id}/${m.id}.imageUrl`);
  }
  for (const h of (await getDocs(collection(db, 'highlightDishes'))).docs) {
    visit(h.data(), `highlightDishes/${h.id}.imageUrl`);
  }
}

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
});
const db = getFirestore(app);

// --- Pass 1: copy still-referenced variants into the Hosting bundle ---------
const liveUrls = new Set();
await forEachImageField(db, (d) => {
  for (const value of Object.values(d)) {
    if (onSuspendedStorage(value)) liveUrls.add(value);
  }
});
console.log(`live storage urls: ${liveUrls.size}`);

const jobs = planCopies(liveUrls);
for (const { from, to } of jobs) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`copied ${jobs.length} variants into public/images/catalog/**`);

// --- Pass 2: point production documents at the Hosting copies ---------------
// Only owners can write these collections under the rules, so the same owner
// sign-in the seed scripts use authenticates the writes here.
await signInWithEmailAndPassword(getAuth(app), 'owner@zaikahub.app', 'Owner12345');

async function rewriteDocuments(db) {
  let rewritten = 0;
  for (const r of (await getDocs(collection(db, 'restaurants'))).docs) {
    const d = r.data();
    const patch = {};
    for (const key of ['coverImageUrl', 'logoImageUrl']) {
      if (onSuspendedStorage(d[key])) {
        patch[key] = toHostingUrl(storagePathOf(d[key]));
        rewritten += 1;
      }
    }
    if (Object.keys(patch).length > 0) {
      await setDoc(doc(db, 'restaurants', r.id), patch, { merge: true });
    }
    const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
    for (const m of menu.docs) {
      const d2 = m.data();
      if (onSuspendedStorage(d2.imageUrl)) {
        await setDoc(doc(db, 'restaurants', r.id, 'menuItems', m.id), {
          imageUrl: toHostingUrl(storagePathOf(d2.imageUrl)),
        }, { merge: true });
        rewritten += 1;
      }
    }
  }
  for (const h of (await getDocs(collection(db, 'highlightDishes'))).docs) {
    const d = h.data();
    if (onSuspendedStorage(d.imageUrl)) {
      await setDoc(doc(db, 'highlightDishes', h.id), {
        imageUrl: toHostingUrl(storagePathOf(d.imageUrl)),
      }, { merge: true });
      rewritten += 1;
    }
  }
  return rewritten;
}

console.log(`rewritten firestore fields: ${await rewriteDocuments(db)}`);

// --- Pass 3: prove the bucket is out of the loop ----------------------------
let remaining = 0;
await forEachImageField(db, (d) => {
  for (const value of Object.values(d)) {
    if (onSuspendedStorage(value)) remaining += 1;
  }
});
console.log(
  remaining === 0
    ? 'no production document references the suspended bucket any more'
    : `${remaining} fields STILL reference the suspended bucket`,
);
process.exit(remaining === 0 ? 0 : 1);
