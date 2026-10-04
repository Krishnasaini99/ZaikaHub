// One-time migration: every Cloudinary URL the site uses becomes a Firebase
// Storage URL under `images/catalog/`.
//
// WHY URL-BY-URL, NOT PHOTO-BY-PHOTO
// ----------------------------------
// Cloudinary resizes in the URL (`w_1200,h_500` for a cover, `w_200,h_200`
// `c_fill` for its logo), and Storage serves bytes exactly as uploaded —
// there is no transform step. So each *distinct URL* is downloaded as final
// pixels and stored as its own file. The Storage name carries the geometry
// (`burger-junction-cover-1200x500-limit.jpg` vs `...-200x200-fill.jpg`), so
// two crops of one photo can never collide and a future reader can see what
// each file is without fetching it.
//
// WHAT IT REWRITES
// ----------------
// 1. Production Firestore: restaurants (cover/logo), menuItems (image),
//    highlightDishes (image). Credits are untouched — same photo, same author.
// 2. Local registries: `seed-images.json`, `cuisine-uploads.json` (url fields).
// 3. Hardcoded URLs: `home.component.ts` cuisine tiles, `index.html` OG tags.
// 4. Records everything in `tools/food-images/storage-uploads.json`, which is
//    also the rollback map (new URL -> old URL) if this ever needs reversing.
//
// PRECONDITIONS (checked up front, aborts otherwise)
// --------------------------------------------------
// - `images/catalog/**` must be writable (the temporary migration window in
//   `storage.rules`; the steady state locks it).
// - `highlightDishes` must be writable (temporary `if true`, restored after).
//
// Usage:
//   node tools/migrate-images-to-storage.mjs
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'zaika-hub-prod';
const BUCKET = 'zaika-hub-prod.firebasestorage.app';
const OWNER = { email: 'owner@zaikahub.app', password: 'Owner12345' };

const env = readFileSync('src/environments/environment.production.ts', 'utf8');
const block = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(env)[1];
const field = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(block)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
  storageBucket: field('storageBucket'),
});
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Local mirror of every downloaded original.
 *
 * Cloudinary intermittently answers **404 "Resource not found"** for a URL
 * that returns 200 moments later from the same machine — a bare probe always
 * succeeded where the migration consistently failed, on a byte-identical URL,
 * which is not a cause one can fix, only design around. So originals are
 * mirrored to this directory first and uploads read from there. Three things
 * follow, all wanted anyway: a re-run never re-downloads, an interrupted run
 * resumes without re-fetching, and the exact bytes that entered Storage stay
 * on disk for audit — which matters because these images carry CC BY
 * attribution. It is gitignored like the other binaries under this folder.
 */
const CACHE_DIR = 'tools/food-images/.migrate-cache';

/**
 * Fetches one image, retrying Cloudinary's throttle.
 *
 * Cloudinary answers **404, not 429**, while rate-limiting a shared IP — and a
 * burst of migration downloads trips it easily. So a 404 here means "try again
 * later", not "gone": the migration aborted on one even though the same URL
 * returned 200 immediately afterwards. Backoff is deliberately long (8s) since
 * a short retry just lands in the same throttle window.
 *
 * A non-image body is treated as a throttle too: the throttle response can
 * arrive as a 200 carrying an HTML error page, which the magic-byte check
 * below would otherwise reject as a corrupt download.
 */
async function fetchImage(url, attempts = 4) {
  const key = createHash('sha1').update(url).digest('hex');
  const cached = readdirSync(CACHE_DIR).find((f) => f.startsWith(key));
  if (cached) {
    const bytes = readFileSync(`${CACHE_DIR}/${cached}`);
    const type = contentTypeFor(cached);
    if (bytes.length > 2000 && hasImageMagic(bytes, type)) {
      return { type, bytes, fromCache: true };
    }
    unlinkSync(`${CACHE_DIR}/${cached}`);
  }

  let last = 'unknown';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      const type = (response.headers.get('content-type') || '')
        .split(';')[0]
        .trim();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (response.ok && EXT[type] && hasImageMagic(bytes, type)) {
        writeFileSync(`${CACHE_DIR}/${key}.${EXT[type]}`, bytes);
        return { type, bytes, fromCache: false };
      }
      last = `status ${response.status}, type "${type}", ${bytes.length} bytes`;
    } catch (error) {
      last = error.message;
    }
    if (attempt < attempts) {
      const wait = 8_000 * attempt;
      console.log(`    retry ${attempt}/${attempts - 1} in ${wait / 1000}s (${last})`);
      await sleep(wait);
    }
  }
  fail(`could not download after ${attempts} attempts (${last}): ${url}`);
}
const REGISTRY = 'tools/food-images/storage-uploads.json';

function fail(message) {
  console.error(`ABORTED: ${message}`);
  process.exit(1);
}

/** `.../upload/f_auto,q_auto,w_480/v123/zaika-hub/cuisines/x.jpg` -> parts. */
function parseCloudinary(url) {
  const m = /\/upload\/([^/]+)\/(?:v\d+\/)?zaika-hub\/(.+)/.exec(url);
  if (!m) return null;
  const chain = m[1];
  const rest = m[2];
  const slash = rest.lastIndexOf('/');
  const group = slash === -1 ? 'misc' : rest.slice(0, slash);
  const base = (slash === -1 ? rest : rest.slice(slash + 1)).replace(/\.[^.]+$/, '');
  const w = /w_(\d+)/.exec(chain)?.[1] ?? '';
  const h = /h_(\d+)/.exec(chain)?.[1] ?? '';
  const crop = chain.includes('c_fill') ? 'fill' : 'limit';
  const geo = w && h ? `-${w}x${h}-${crop}` : '';
  return { group, name: `${base}${geo}` };
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Reverse of {@link EXT}, for files already sitting in the cache. */
function contentTypeFor(fileName) {
  const ext = fileName.split('.').pop() ?? '';
  return Object.keys(EXT).find((type) => EXT[type] === ext) ?? '';
}

/**
 * Real image header check, per content type.
 *
 * The 8KB size floor below catches stub responses, but a mostly-white 200px
 * logo legitimately compresses to ~4KB — and Cloudinary serves its throttle
 * pages as 200s, so size alone cannot tell a tiny photo from an error page.
 * Magic bytes can: an HTML error page starts with `<`, never with a JPEG
 * SOI marker.
 */
function hasImageMagic(bytes, type) {
  if (type === 'image/jpeg') {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    return (
      bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    );
  }
  if (type === 'image/webp') {
    return (
      bytes.length > 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

/**
 * URLs that can be discovered without touching Firestore: the two local
 * registries and the two hardcoded source files.
 *
 * Split out because `--prefetch` needs them on their own — Cloudinary has been
 * observed answering 404 for the link-preview image only *inside* the full
 * migration (which has already signed in and streamed dozens of Firestore
 * documents) while a bare fetch of the identical URL succeeds every time.
 * Downloading first, with no Firebase in the process at all, sidesteps that
 * and doubles as a warm cache for the real run.
 */
function collectLocalUrls() {
  const urls = new Set();
  const seedImages = JSON.parse(readFileSync('tools/food-images/seed-images.json', 'utf8'));
  for (const entry of Object.values(seedImages.covers)) {
    if (entry?.url) urls.add(entry.url);
    if (entry?.logo) urls.add(entry.logo);
  }
  for (const entry of Object.values(seedImages.dishes)) {
    if (entry?.url) urls.add(entry.url);
  }
  const cuisineUploads = JSON.parse(
    readFileSync('tools/food-images/cuisine-uploads.json', 'utf8'),
  );
  for (const entry of Object.values(cuisineUploads)) {
    if (entry?.url) urls.add(entry.url);
  }
  for (const file of [
    'src/app/features/home/home.component.ts',
    'src/index.html',
  ]) {
    for (const match of readFileSync(file, 'utf8').matchAll(/https:\/\/res\.cloudinary\.com\/[^\s'"]+/g)) {
      urls.add(match[0]);
    }
  }
  return [...urls].filter((u) => u.includes('res.cloudinary.com'));
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  // ---- prefetch: mirror every discoverable original, no Firebase involved --
  if (process.argv.includes('--prefetch')) {
    const local = collectLocalUrls();
    console.log(`prefetching ${local.length} URLs into ${CACHE_DIR}`);
    let done = 0;
    for (const url of local) {
      const { bytes, fromCache } = await fetchImage(url);
      done += 1;
      console.log(`  [${done}/${local.length}] ${bytes.length}b ${fromCache ? '(cached)' : ''}`);
      if (!fromCache) await sleep(1500);
    }
    console.log(`PREFETCH COMPLETE — ${done} originals mirrored`);
    process.exit(0);
  }

  await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password);
  console.log(`signed in as ${OWNER.email}`);

  // ---- 1. collect every Cloudinary URL and where it is used ----
  /** url -> { path, uses: [{ kind, ref }] } */
  const urls = new Map();
  const add = (url, use) => {
    if (!url || !url.includes('res.cloudinary.com')) return;
    const parsed = parseCloudinary(url);
    if (!parsed) fail(`cannot parse Cloudinary URL: ${url}`);
    let entry = urls.get(url);
    if (!entry) {
      entry = { group: parsed.group, name: parsed.name, uses: [] };
      urls.set(url, entry);
    }
    entry.uses.push(use);
  };

  const restaurants = await getDocs(collection(db, 'restaurants'));
  for (const r of restaurants.docs) {
    add(r.data().coverImageUrl, { kind: 'restaurant-cover', id: r.id });
    add(r.data().logoImageUrl, { kind: 'restaurant-logo', id: r.id });
    const menu = await getDocs(collection(db, 'restaurants', r.id, 'menuItems'));
    for (const m of menu.docs) {
      add(m.data().imageUrl, { kind: 'menu-item', restaurant: r.id, id: m.id });
    }
  }
  const highlights = await getDocs(collection(db, 'highlightDishes'));
  for (const h of highlights.docs) {
    add(h.data().imageUrl, { kind: 'highlight', id: h.id });
  }

  const seedImages = JSON.parse(readFileSync('tools/food-images/seed-images.json', 'utf8'));
  for (const [slug, e] of Object.entries(seedImages.covers)) {
    add(e.url, { kind: 'seed-cover', id: slug });
    add(e.logo, { kind: 'seed-logo', id: slug });
  }
  for (const [key, e] of Object.entries(seedImages.dishes)) {
    add(e.url, { kind: 'seed-dish', id: key });
  }
  const cuisineUploads = JSON.parse(
    readFileSync('tools/food-images/cuisine-uploads.json', 'utf8'),
  );
  for (const [id, e] of Object.entries(cuisineUploads)) {
    add(e.url, { kind: 'cuisine-upload', id });
  }
  const homeSource = readFileSync('src/app/features/home/home.component.ts', 'utf8');
  for (const m of homeSource.matchAll(/https:\/\/res\.cloudinary\.com\/[^\s'"]+/g)) {
    add(m[0], { kind: 'home-tile' });
  }
  const indexSource = readFileSync('src/index.html', 'utf8');
  for (const m of indexSource.matchAll(/https:\/\/res\.cloudinary\.com\/[^\s'"]+/g)) {
    add(m[0], { kind: 'og-image' });
  }

  console.log(`collected ${urls.size} unique Cloudinary URLs`);

  // ---- 2. upload each as final pixels ----
  // Resumable: each upload is recorded in a partial file as it completes, so
  // an aborted run (throttle, network blip, or a validation stop like the
  // one that caught a 4.5KB-but-legitimate logo) resumes where it left off
  // instead of re-uploading everything. Same URL always maps to the same
  // Storage path, so a resumed upload overwrites identical bytes.
  const PARTIAL = 'tools/food-images/storage-uploads.partial.json';
  let partial = {};
  try {
    partial = JSON.parse(readFileSync(PARTIAL, 'utf8'));
  } catch {
    partial = {};
  }
  const uploaded = new Map(Object.entries(partial));
  const skipped = uploaded.size;
  if (skipped > 0) {
    console.log(`resuming: ${skipped} already uploaded, skipping`);
  }

  const savePartial = () =>
    writeFileSync(PARTIAL, `${JSON.stringify(Object.fromEntries(uploaded), null, 2)}\n`);

  let n = skipped;
  for (const [url, entry] of urls) {
    if (uploaded.has(url)) {
      continue;
    }
    n += 1;
    const { type, bytes } = await fetchImage(url);
    const ext = EXT[type];

    const path = `images/catalog/${entry.group}/${entry.name}.${ext}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, bytes, { contentType: type });
    const fresh = await getDownloadURL(fileRef);
    uploaded.set(url, fresh);
    savePartial();
    console.log(`  [${n}/${urls.size}] ${path} (${Math.round(bytes.length / 1024)}kB)`);
    // Paced: Cloudinary answers 404 rather than 429 while throttling, so a
    // burst silently produces broken tiles that look like missing files.
    await sleep(1500);
  }

  // ---- 3a. rewrite production Firestore ----
  const docFor = (use) => {
    if (use.kind === 'restaurant-cover' || use.kind === 'restaurant-logo') {
      return doc(db, 'restaurants', use.id);
    }
    if (use.kind === 'menu-item') {
      return doc(db, 'restaurants', use.restaurant, 'menuItems', use.id);
    }
    return doc(db, 'highlightDishes', use.id);
  };
  const fieldFor = (use) =>
    use.kind === 'restaurant-cover'
      ? 'coverImageUrl'
      : use.kind === 'restaurant-logo'
        ? 'logoImageUrl'
        : 'imageUrl';

  let prodWrites = 0;
  for (const [url, entry] of urls) {
    for (const use of entry.uses) {
      if (!['restaurant-cover', 'restaurant-logo', 'menu-item', 'highlight'].includes(use.kind)) {
        continue;
      }
      await updateDoc(docFor(use), { [fieldFor(use)]: uploaded.get(url) });
      prodWrites += 1;
    }
  }
  console.log(`rewrote ${prodWrites} production image fields`);

  // ---- 3b. rewrite local registries ----
  const swapUrls = (obj) => {
    let changed = 0;
    const walk = (node) => {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && uploaded.has(v)) {
          node[k] = uploaded.get(v);
          changed += 1;
        } else if (v && typeof v === 'object') {
          walk(v);
        }
      }
    };
    walk(obj);
    return changed;
  };

  const seedCount = swapUrls(seedImages);
  writeFileSync('tools/food-images/seed-images.json', `${JSON.stringify(seedImages, null, 2)}\n`);
  const cuisineCount = swapUrls(cuisineUploads);
  writeFileSync(
    'tools/food-images/cuisine-uploads.json',
    `${JSON.stringify(cuisineUploads, null, 2)}\n`,
  );
  console.log(`rewrote ${seedCount} seed-images.json + ${cuisineCount} cuisine-uploads.json URLs`);

  // ---- 3c. rewrite hardcoded sources ----
  let homeUpdated = homeSource;
  let indexUpdated = indexSource;
  for (const [oldUrl, newUrl] of uploaded) {
    homeUpdated = homeUpdated.split(oldUrl).join(newUrl);
    indexUpdated = indexUpdated.split(oldUrl).join(newUrl);
  }
  writeFileSync('src/app/features/home/home.component.ts', homeUpdated);
  writeFileSync('src/index.html', indexUpdated);
  console.log('rewrote home.component.ts + index.html');

  // ---- 4. registry + verify ----
  const registry = {};
  for (const [oldUrl, newUrl] of uploaded) {
    registry[newUrl] = { from: oldUrl, uses: urls.get(oldUrl).uses.map((u) => u.kind) };
  }
  writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);

  let bad = 0;
  for (const newUrl of uploaded.values()) {
    try {
      const check = await fetch(newUrl, { method: 'HEAD' });
      if (!check.ok || !(check.headers.get('content-type') || '').startsWith('image/')) {
        console.log(`  FAIL ${check.status} ${newUrl.slice(-70)}`);
        bad += 1;
      }
    } catch (error) {
      console.log(`  ERR ${newUrl.slice(-70)} ${error.message}`);
      bad += 1;
    }
    await sleep(1200);
  }
  if (bad > 0) fail(`${bad} migrated URLs do not resolve`);
  console.log(`ALL ${uploaded.size} MIGRATED URLS RESOLVE`);
  try {
    unlinkSync(PARTIAL);
  } catch {
    // Already gone — nothing to clean up.
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});
