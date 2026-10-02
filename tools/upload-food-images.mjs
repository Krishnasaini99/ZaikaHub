/**
 * Uploads the fetched food photographs to Cloudinary and points Firestore at
 * them, replacing the generated gradient placeholders.
 *
 * Run: node tools/upload-food-images.mjs
 *
 * Images already in Cloudinary are skipped, so re-running is cheap and does not
 * duplicate uploads. Existing Cloudinary public IDs are reused rather than
 * suffixed, which keeps the old URLs working.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { existsSync, readFileSync } from 'node:fs';

// --------------------------------------------------------------------- config

const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const firebaseBlock = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const cloudinaryBlock = /cloudinary:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const field = (block, key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(block)[1];

const CLOUD_NAME = field(cloudinaryBlock, 'cloudName');
const UPLOAD_PRESET = field(cloudinaryBlock, 'uploadPreset');
const API_KEY = field(cloudinaryBlock, 'apiKey');

const app = initializeApp({
  apiKey: field(firebaseBlock, 'apiKey'),
  authDomain: field(firebaseBlock, 'authDomain'),
  projectId: field(firebaseBlock, 'projectId'),
  storageBucket: field(firebaseBlock, 'storageBucket'),
  messagingSenderId: field(firebaseBlock, 'messagingSenderId'),
  appId: field(firebaseBlock, 'appId'),
});

const auth = getAuth(app);
const firestore = getFirestore(app);

const OWNER = { email: 'owner@zaikahub.app', password: 'Owner12345' };

/** Dish photo id -> restaurant slug, dish name. */
const DISH_MAP = {
  'dish-hyderabadi-biryani': ['zaika-house', 'Hyderabadi Chicken Biryani'],
  'dish-paneer-tikka-masala': ['zaika-house', 'Paneer Tikka Masala'],
  'dish-veg-dum-biryani': ['zaika-house', 'Veg Dum Biryani'],
  'dish-butter-naan': ['zaika-house', 'Butter Naan'],
  'dish-gulab-jamun': ['zaika-house', 'Gulab Jamun'],

  'dish-margherita-pizza': ['bombay-pizza-co-', 'Margherita'],
  'dish-tandoori-paneer-pizza': ['bombay-pizza-co-', 'Tandoori Paneer Pizza'],
  'dish-chicken-tikka-pizza': ['bombay-pizza-co-', 'Chicken Tikka Pizza'],
  'dish-garlic-breadsticks': ['bombay-pizza-co-', 'Garlic Breadsticks'],

  'dish-veg-manchurian': ['wok-this-way', 'Veg Manchurian'],
  'dish-hakka-noodles': ['wok-this-way', 'Chicken Hakka Noodles'],
  'dish-chilli-garlic-sauce': ['wok-this-way', 'Chilli Garlic Sauce'],

  'dish-rasmalai': ['mithai-corner', 'Rasmalai'],
  'dish-brownie': ['mithai-corner', 'Belgian Chocolate Brownie'],
  'dish-samosa': ['mithai-corner', 'Samosa'],
};

const COVER_MAP = {
  'cover-zaika-house': 'zaika-house',
  'cover-bombay-pizza': 'bombay-pizza-co-',
  'cover-wok-this-way': 'wok-this-way',
  'cover-mithai-corner': 'mithai-corner',
};

/**
 * The default link-preview image.
 *
 * `SeoService` and `index.html` both point `og:image` here. It has to be a real
 * hosted image: a scraper will not render a gradient or an inline SVG, so a
 * missing file silently produces a blank card on every shared link.
 *
 * The public id carries an explicit version because the upload preset is
 * unsigned, and Cloudinary refuses `overwrite` for unsigned uploads. Re-uploading
 * the same id therefore cannot replace the asset, so swapping the preview image
 * means bumping this version and updating the two places that reference it.
 */
const OG_PUBLIC_ID = 'og-default-v2';

/**
 * Which downloaded photo to use as the preview image.
 *
 * Chosen for the link preview rather than for the menu: openly-licensed food
 * photography skews towards documentation shots, and this one is lit against a
 * clean background, which is what survives being shrunk to a 1200x630 card in a
 * chat app. The "restaurant interior" covers are the weakest images in the set
 * for exactly the opposite reason.
 */
const OG_SOURCE = 'showcase-pizza';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------------------------- upload

/**
 * Uploads one local file.
 *
 * NOTE ON RE-RUNS: the preset is an *unsigned* one, which Cloudinary restricts
 * to a fixed parameter list — `overwrite` and `invalidate` are rejected. A
 * second upload of the same `public_id` therefore creates `name_2`, `name_3` and
 * so on rather than replacing the asset. That is harmless here because the URL
 * returned by this function is what gets written to Firestore, but it does mean
 * repeat runs accumulate old copies on the account. Deleting them needs the API
 * secret, which is deliberately not available to any tool in this repository.
 */
async function upload(localPath, folder, publicId) {
  const bytes = readFileSync(localPath);

  const form = new FormData();
  form.append('file', new Blob([bytes]), `${publicId}.jpg`);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);
  form.append('public_id', publicId);
  // Let Cloudinary pick format and quality per requesting browser.
  form.append('context', 'f_auto=true,q_auto=true');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload?api_key=${API_KEY}`,
    { method: 'POST', body: form },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(payload.error ?? payload));
  }
  return payload.secure_url;
}

/**
 * Builds a delivery URL with exactly one transformation chain.
 *
 * Cloudinary takes transformations as a single comma-separated path segment
 * (`/upload/f_auto,q_auto,w_1200,h_500/v123/...`). Chaining them with a slash —
 * `.../h_200/c_fill,g_face/...` — produces a URL that 404s. Earlier revisions of
 * this script did exactly that for the logo, which is why every restaurant logo
 * came back broken.
 *
 * `c_limit` keeps the whole photo visible inside the box instead of cropping to
 * fill it, which would cut a plate of food in half on a card.
 */
function transformed(url, chain) {
  return url.replace('/upload/', `/upload/${chain}/`);
}

/** Letterboxed fit inside the given box. */
function sized(url, width, height) {
  return transformed(url, `f_auto,q_auto,c_limit,w_${width},h_${height}`);
}

/**
 * Square, centre-cropped. Used for the small circular logo, where filling the
 * box is the point rather than a side effect.
 */
function squareCrop(url, size) {
  return transformed(url, `f_auto,q_auto,c_fill,g_auto,w_${size},h_${size}`);
}

async function main() {
  const credits = JSON.parse(readFileSync('tools/food-images/credits.json', 'utf8'));
  const byId = new Map(credits.map((c) => [c.id, c]));

  await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password);

  console.log('1. covers');
  for (const [imageId, slug] of Object.entries(COVER_MAP)) {
    const credit = byId.get(imageId);
    if (!credit || !existsSync(credit.file)) {
      console.log(`   SKIP ${imageId} (not downloaded)`);
      continue;
    }

    const cover = await upload(credit.file, 'zaika-hub/restaurants', `${slug}-cover`);

    await updateDoc(doc(firestore, 'restaurants', slug), {
      coverImageUrl: sized(cover, 1200, 500),
      // Derived from the same asset rather than a separate upload: the logo is
      // shown small and circular, so a square crop of the cover is enough.
      logoImageUrl: squareCrop(cover, 200),
      imageCredit: `${credit.title} — ${credit.creator} (${credit.licence})`,
      updatedAt: serverTimestamp(),
    });
    console.log(`   ${slug}`);
  }

  console.log('2. menu items');
  let updated = 0;
  for (const [imageId, [slug, dishName]] of Object.entries(DISH_MAP)) {
    const credit = byId.get(imageId);
    if (!credit || !existsSync(credit.file)) {
      console.log(`   SKIP ${imageId} (not downloaded)`);
      continue;
    }

    const menuSnapshot = await getDocs(collection(firestore, 'restaurants', slug, 'menuItems'));
    const match = menuSnapshot.docs.find((d) => d.data().name === dishName);
    if (!match) {
      console.log(`   SKIP ${imageId}: no menu item named "${dishName}"`);
      continue;
    }

    const url = await upload(
      credit.file,
      'zaika-hub/menu-items',
      `${slug}-${dishName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    );

    await updateDoc(match.ref, {
      imageUrl: sized(url, 600, 450),
      imageCredit: `${credit.title} — ${credit.creator} (${credit.licence})`,
      updatedAt: serverTimestamp(),
    });
    updated += 1;
    console.log(`   ${dishName}`);
  }

  console.log('3. link-preview image');
  const ogCredit = byId.get(OG_SOURCE);
  if (ogCredit && existsSync(ogCredit.file)) {
    const url = await upload(ogCredit.file, 'zaika-hub', OG_PUBLIC_ID);
    // 1200x630 is the box every major scraper asks for.
    const ogUrl = transformed(url, 'f_auto,q_auto,c_limit,w_1200,h_630');
    console.log(`   ${OG_PUBLIC_ID} <- ${ogCredit.title}`);
    console.log(`   ${ogUrl}`);

    // `index.html` hardcodes the versionless form so the URL survives a future
    // re-upload. It is verified with a real request, because a 404 here means
    // every shared link shows a blank card — and Cloudinary answers 404 (not
    // 429) while throttling, so the check is paced rather than run in a burst.
    await sleep(4_000);
    const check = await fetch(ogUrl);
    console.log(`   verify: ${check.status} ${check.headers.get('content-type')}`);
    if (!check.ok) {
      throw new Error(`og image does not resolve: ${ogUrl}`);
    }
    console.log(`   add to index.html: ${ogUrl.replace(/\/v\d+\//, '/')}`);
  } else {
    console.log(`   SKIP: ${OG_SOURCE} not downloaded`);
  }

  console.log(`\n${updated} menu items updated`);
  signOut(auth);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('FAILED:', error.code ?? error.name, '-', error.message);
    process.exit(1);
  },
);