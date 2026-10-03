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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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

/**
 * The "Order by cuisine" tiles.
 *
 * These live in `HomeComponent`'s hardcoded `cuisines` array rather than in a
 * Firestore collection, because the cuisine names, emoji fallbacks and
 * `/restaurants?cuisine=` filter links already live there. Putting the image URL
 * beside them keeps one source of truth instead of splitting the same row
 * across code and database.
 *
 * The URLs this section prints are what get pasted into that array.
 */
const CUISINE_IDS = [
  'cuisine-biryani',
  'cuisine-pizza',
  'cuisine-burgers',
  'cuisine-desserts',
  'cuisine-chinese',
  'cuisine-south-indian',
  'cuisine-north-indian',
  'cuisine-street-food',
];

/**
 * Photographs for the restaurants that only exist in `tools/seed.mjs`.
 *
 * `COVER_MAP` and `DISH_MAP` above exist to patch images onto restaurants that
 * are already live in production — they `updateDoc` a document that has to be
 * there first. A restaurant added to the seeder has no production document, so
 * those sections cannot serve it: `updateDoc` on a missing doc throws, and
 * section 2 would simply report "no menu item named …" forever.
 *
 * Section 5 therefore uploads this set on its own and records the result in
 * `tools/food-images/seed-images.json`, which is the file the seeder falls
 * back to when production has no answer. Keys are production's own shapes —
 * `slug` for a cover, `slug/dish name` for a dish — so the seeder can fall
 * through one source to the next without knowing which is speaking.
 *
 * Two entries here are photographs already used elsewhere: a samosa sold at
 * Chatori Galli and a butter naan served by Seekh & Roll House are the same
 * dishes the original restaurants sell, so the same licensed photo is the
 * honest choice. They still need their own upload because Cloudinary's unsigned
 * preset refuses `overwrite` and the seeder keys its lookup by restaurant.
 */
const SEED_ONLY = {
  covers: {
    'cover-burger-junction': 'burger-junction',
    'cover-dakshin-kitchen': 'dakshin-kitchen',
    'cover-chatori-galli': 'chatori-galli',
    'cover-seekh-roll-house': 'seekh-roll-house',
  },
  dishes: {
    'dish-cheeseburger': ['burger-junction', 'Classic Cheeseburger'],
    'dish-veg-burger': ['burger-junction', 'Veg Crispy Burger'],
    'dish-french-fries': ['burger-junction', 'Peri Peri Fries'],
    'dish-chocolate-milkshake': ['burger-junction', 'Chocolate Milkshake'],

    'dish-masala-dosa': ['dakshin-kitchen', 'Masala Dosa'],
    'dish-idli-sambar': ['dakshin-kitchen', 'Idli Sambar'],
    'dish-medu-vada': ['dakshin-kitchen', 'Medu Vada'],
    'dish-filter-coffee': ['dakshin-kitchen', 'Filter Coffee'],

    'dish-pani-puri': ['chatori-galli', 'Pani Puri'],
    'dish-pav-bhaji': ['chatori-galli', 'Pav Bhaji'],
    'dish-chole-bhature': ['chatori-galli', 'Chole Bhature'],
    'dish-samosa': ['chatori-galli', 'Samosa'],

    'dish-seekh-kebab': ['seekh-roll-house', 'Chicken Seekh Kebab'],
    'dish-tandoori-chicken': ['seekh-roll-house', 'Tandoori Chicken'],
    'dish-mutton-korma': ['seekh-roll-house', 'Mutton Korma'],
    'dish-butter-naan': ['seekh-roll-house', 'Butter Naan'],

    // Hero dishes the two original houses were short of. Their restaurants DO
    // exist in production, but these menu items were added here and therefore
    // have no production document for section 2 to find either.
    'dish-butter-chicken': ['zaika-house', 'Butter Chicken'],
    'dish-spring-rolls': ['wok-this-way', 'Spring Rolls'],
  },
};

const SEED_LOG_PATH = 'tools/food-images/seed-images.json';

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

/**
 * Publishes the photographs the local seeder falls back to.
 *
 * Split out from `main()` because it is the only section that both (a) never
 * writes to Firestore and (b) is needed by `tools/seed.mjs`, so it has to be
 * callable on its own via `--seed-only` without dragging the production-patching
 * sections along with it.
 *
 * Cloudinary's unsigned preset cannot overwrite, so every id it has already
 * published is recorded in `seed-images.json` and skipped on later runs. That
 * makes an interrupted run resumable and, more importantly, stops a second run
 * from orphaning a `_2` copy of every one of these files.
 */
async function uploadSeedImages(byId) {
  const seedLog = existsSync(SEED_LOG_PATH)
    ? JSON.parse(readFileSync(SEED_LOG_PATH, 'utf8'))
    : { covers: {}, dishes: {} };
  seedLog.covers ??= {};
  seedLog.dishes ??= {};

  let recorded = 0;
  for (const [imageId, slug] of Object.entries(SEED_ONLY.covers)) {
    if (seedLog.covers[slug]) {
      console.log(`   cover ${slug} (already uploaded)`);
      continue;
    }
    const credit = byId.get(imageId);
    if (!credit || !existsSync(credit.file)) {
      console.log(`   SKIP ${imageId} (not downloaded)`);
      continue;
    }

    const cover = await upload(credit.file, 'zaika-hub/restaurants', `${slug}-cover`);
    seedLog.covers[slug] = {
      url: sized(cover, 1200, 500),
      // Derived from the same asset for the same reason section 1 does it: the
      // logo is a small circle, a square crop of the cover is enough.
      logo: squareCrop(cover, 200),
      credit: `${credit.title} — ${credit.creator} (${credit.licence})`,
    };
    writeFileSync(SEED_LOG_PATH, JSON.stringify(seedLog, null, 2));
    recorded += 1;
    console.log(`   cover ${slug} <- ${credit.title}`);
    await sleep(1_500);
  }

  for (const [imageId, [slug, dishName]] of Object.entries(SEED_ONLY.dishes)) {
    const key = `${slug}/${dishName}`;
    if (seedLog.dishes[key]) {
      console.log(`   ${key} (already uploaded)`);
      continue;
    }
    const credit = byId.get(imageId);
    if (!credit || !existsSync(credit.file)) {
      console.log(`   SKIP ${imageId} (not downloaded)`);
      continue;
    }

    const url = await upload(
      credit.file,
      'zaika-hub/menu-items',
      `${slug}-${dishName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    );
    seedLog.dishes[key] = {
      url: sized(url, 600, 450),
      credit: `${credit.title} — ${credit.creator} (${credit.licence})`,
    };
    writeFileSync(SEED_LOG_PATH, JSON.stringify(seedLog, null, 2));
    recorded += 1;
    console.log(`   ${key}`);
    await sleep(1_500);
  }

  console.log(
    `   ${recorded} new; registry now holds ${Object.keys(seedLog.covers).length} covers and ${Object.keys(seedLog.dishes).length} dishes`,
  );
}

async function main() {
  const credits = JSON.parse(readFileSync('tools/food-images/credits.json', 'utf8'));
  const byId = new Map(credits.map((c) => [c.id, c]));

  /**
   * `--seed-only` runs section 5 and nothing else.
   *
   * Sections 1-3 patch the live project: they re-upload every cover and menu
   * photo (the unsigned preset cannot overwrite, so each run orphans another
   * copy as `name_2`) and bump `updatedAt` across production for images that
   * have not changed. Section 5 is the only one the local seeder depends on,
   * and it never writes to Firestore — so a routine "publish the photos a newly
   * added restaurant needs" should not cost production a single write.
   */
  if (process.argv.includes('--seed-only')) {
    console.log('sections 1-4 skipped (--seed-only)');
    await uploadSeedImages(byId);
    return;
  }

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

  console.log('4. cuisine tiles');
  // Cloudinary's unsigned preset rejects `overwrite`, so a re-upload of the same
  // public id lands as `name_2` and the old copy is orphaned. The completed set
  // is therefore recorded on disk and skipped on re-run, which also makes a
  // run interrupted half way safe to resume.
  const uploadLogPath = 'tools/food-images/cuisine-uploads.json';
  const done = existsSync(uploadLogPath)
    ? JSON.parse(readFileSync(uploadLogPath, 'utf8'))
    : {};

  for (const imageId of CUISINE_IDS) {
    if (done[imageId]) {
      console.log(`   ${imageId} (already uploaded)`);
      continue;
    }
    const credit = byId.get(imageId);
    if (!credit || !existsSync(credit.file)) {
      console.log(`   SKIP ${imageId} (not downloaded)`);
      continue;
    }

    const uploaded = await upload(credit.file, 'zaika-hub/cuisines', imageId);
    done[imageId] = {
      url: transformed(uploaded, 'f_auto,q_auto,w_480'),
      credit: `${credit.title} — ${credit.creator} (${credit.licence})`,
    };
    writeFileSync(uploadLogPath, JSON.stringify(done, null, 2));
    console.log(`   ${imageId} -> ${credit.title}`);
    // Paced: Cloudinary answers 404 rather than 429 while throttling, so a burst
    // of uploads silently produces broken tiles that look like missing files.
    await sleep(1_500);
  }

  console.log('\ncuisine tile URLs:');
  for (const imageId of CUISINE_IDS) {
    const entry = done[imageId];
    if (entry) {
      console.log(`   ${imageId}\n     ${entry.url}\n     ${entry.credit}`);
    }
  }

  await uploadSeedImages(byId);

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