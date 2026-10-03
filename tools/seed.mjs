/**
 * Seeds the Firestore + Storage emulator with a small but realistic dataset.
 *
 * Run the emulator suite first, then this script:
 *   npm run emulators
 *   npm run seed
 *
 * It writes through the emulator only, so it can never touch real data.
 *
 * The seeder signs in as a real emulator user rather than bypassing auth,
 * because `storage.rules` requires `request.auth.uid == ownerId`. That also
 * means the seeded restaurants belong to a uid you can actually log in with and
 * use the owner panel.
 */
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';

const USE_EMULATORS = process.env['USE_EMULATORS'] !== 'false';

const PROJECT_ID = 'zaika-hub-prod';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'fake-api-key-for-emulator';

/** The account the seeded restaurants belong to. Sign in with this in the app. */
const SEED_OWNER = {
  email: 'owner@zaikahub.test',
  password: 'Owner12345',
  displayName: 'Seed Owner',
};

const app = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.firebasestorage.app`,
});

if (USE_EMULATORS) {
  connectAuthEmulator(getAuth(app), AUTH_EMULATOR, { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
}

/** 1×1 transparent PNG — enough to exercise the upload + display path. */
const PLACEHOLDER_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

const RESTAURANTS = [
  {
    name: 'Zaika House',
    cuisines: ['North Indian', 'Biryani'],
    priceBand: 'mid',
    rating: 4.5,
    ratingCount: 1284,
    deliveryTimeMinutes: 32,
    costForTwo: 600,
    area: 'Koramangala',
    city: 'Bengaluru',
    address: '80 Feet Road, 4th Block',
    featured: true,
    menu: [
      { name: 'Hyderabadi Chicken Biryani', description: 'Dum-cooked basmati with spiced chicken.', price: 320, category: 'Biryani', isVeg: false, isBestseller: true },
      { name: 'Paneer Tikka Masala', description: 'Charred paneer in a spiced tomato gravy.', price: 260, category: 'Curries', isVeg: true },
      { name: 'Butter Chicken', description: 'Slow-simmered tomato and cream gravy.', price: 340, category: 'Curries', isVeg: false, isBestseller: true },
      { name: 'Veg Dum Biryani', description: 'Seasonal vegetables, saffron rice.', price: 240, category: 'Biryani', isVeg: true },
      { name: 'Butter Naan', description: 'Soft, brushed with Amul butter.', price: 60, category: 'Breads', isVeg: true },
      { name: 'Gulab Jamun', description: 'Warm khoya dumplings in cardamom syrup.', price: 120, category: 'Desserts', isVeg: true },
    ],
  },
  {
    name: 'Bombay Pizza Co.',
    cuisines: ['Pizza', 'Italian'],
    priceBand: 'mid',
    rating: 4.2,
    ratingCount: 842,
    deliveryTimeMinutes: 28,
    costForTwo: 500,
    area: 'Indiranagar',
    city: 'Bengaluru',
    address: '12th Main, Indiranagar',
    featured: true,
    menu: [
      { name: 'Margherita', description: 'San Marzano tomato, fior di latte, basil.', price: 280, category: 'Classic', isVeg: true, isBestseller: true },
      { name: 'Tandoori Paneer Pizza', description: 'Spiced paneer, onion, green chilli.', price: 340, category: 'Speciality', isVeg: true },
      { name: 'Chicken Tikka Pizza', description: 'Roast chicken tikka with mint drizzle.', price: 380, category: 'Speciality', isVeg: false },
      { name: 'Garlic Breadsticks', description: 'With herbed garlic butter.', price: 140, category: 'Sides', isVeg: true },
    ],
  },
  {
    name: 'Wok This Way',
    cuisines: ['Chinese', 'Thai'],
    priceBand: 'budget',
    rating: 3.8,
    ratingCount: 419,
    deliveryTimeMinutes: 40,
    costForTwo: 350,
    area: 'HSR Layout',
    city: 'Bengaluru',
    address: 'Sector 2, HSR Layout',
    featured: false,
    menu: [
      { name: 'Veg Manchurian', description: 'Crisp fried vegetables in a savoury sauce.', price: 180, category: 'Starters', isVeg: true },
      { name: 'Spring Rolls', description: 'Deep-fried rolls with shredded vegetables.', price: 160, category: 'Starters', isVeg: true, isBestseller: true },
      { name: 'Chicken Hakka Noodles', description: 'Wok-tossed noodles with julienned vegetables.', price: 220, category: 'Noodles', isVeg: false },
      { name: 'Chilli Garlic Sauce', description: 'Extra-hot dip.', price: 40, category: 'Extras', isVeg: true },
    ],
  },
  {
    name: 'Mithai Corner',
    cuisines: ['Desserts', 'Bakery'],
    priceBand: 'budget',
    rating: 4.6,
    ratingCount: 2311,
    deliveryTimeMinutes: 25,
    costForTwo: 250,
    area: 'Jayanagar',
    city: 'Bengaluru',
    address: '4th Block, Jayanagar',
    featured: true,
    menu: [
      { name: 'Rasmalai', description: 'Chilled saffron milk cake.', price: 150, category: 'Milk Sweets', isVeg: true, isBestseller: true },
      { name: 'Belgian Chocolate Brownie', description: 'Fudgy, with a molten centre.', price: 130, category: 'Cakes', isVeg: true },
      { name: 'Samosa', description: 'Two crisp aloo samosas with chutney.', price: 70, category: 'Savouries', isVeg: true },
    ],
  },
  {
    name: 'Burger Junction',
    cuisines: ['Burgers', 'Fast Food'],
    priceBand: 'mid',
    rating: 4.3,
    ratingCount: 967,
    deliveryTimeMinutes: 26,
    costForTwo: 400,
    area: 'Indiranagar',
    city: 'Bengaluru',
    address: '100 Feet Road, Indiranagar',
    featured: false,
    menu: [
      { name: 'Classic Cheeseburger', description: 'Grilled patty, cheddar, house sauce.', price: 220, category: 'Burgers', isVeg: false, isBestseller: true },
      { name: 'Veg Crispy Burger', description: 'Crumb-fried patty with shredded lettuce.', price: 170, category: 'Burgers', isVeg: true },
      { name: 'Peri Peri Fries', description: 'Skin-on fries dusted with peri peri.', price: 120, category: 'Sides', isVeg: true },
      { name: 'Chocolate Milkshake', description: 'Thick shake, whipped cream on top.', price: 150, category: 'Shakes', isVeg: true },
    ],
  },
  {
    name: 'Dakshin Kitchen',
    cuisines: ['South Indian', 'Dosa'],
    priceBand: 'budget',
    rating: 4.4,
    ratingCount: 1876,
    deliveryTimeMinutes: 24,
    costForTwo: 300,
    area: 'Jayanagar',
    city: 'Bengaluru',
    address: '11th Main, 4th Block',
    featured: true,
    menu: [
      { name: 'Masala Dosa', description: 'Golden crepe with spiced potato filling.', price: 140, category: 'Dosa', isVeg: true, isBestseller: true },
      { name: 'Idli Sambar', description: 'Steamed idli with lentil stew.', price: 90, category: 'Idli & Vada', isVeg: true },
      { name: 'Medu Vada', description: 'Crisp lentil doughnuts, coconut chutney.', price: 80, category: 'Idli & Vada', isVeg: true },
      { name: 'Filter Coffee', description: 'Decoction brewed, served frothing.', price: 50, category: 'Beverages', isVeg: true },
    ],
  },
  {
    name: 'Chatori Galli',
    cuisines: ['Street Food', 'Chaat'],
    priceBand: 'budget',
    rating: 4.1,
    ratingCount: 734,
    deliveryTimeMinutes: 30,
    costForTwo: 250,
    area: 'Malleshwaram',
    city: 'Bengaluru',
    address: '8th Cross, Malleshwaram',
    featured: false,
    menu: [
      { name: 'Pani Puri', description: 'Six puris with spiced mint water.', price: 60, category: 'Chaat', isVeg: true, isBestseller: true },
      { name: 'Pav Bhaji', description: 'Butter-mashed vegetables with soft rolls.', price: 130, category: 'Chaat', isVeg: true },
      { name: 'Chole Bhature', description: 'Fluffy bhature with Punjabi chole.', price: 110, category: 'Chaat', isVeg: true },
      { name: 'Samosa', description: 'Two crisp aloo samosas with chutney.', price: 40, category: 'Snacks', isVeg: true },
    ],
  },
  {
    name: 'Seekh & Roll House',
    cuisines: ['Mughlai', 'Kebabs'],
    priceBand: 'mid',
    rating: 4.2,
    ratingCount: 651,
    deliveryTimeMinutes: 35,
    costForTwo: 550,
    area: 'Koramangala',
    city: 'Bengaluru',
    address: '5th Block, Koramangala',
    featured: true,
    menu: [
      { name: 'Chicken Seekh Kebab', description: 'Charcoal-grilled minced chicken.', price: 260, category: 'Kebabs', isVeg: false, isBestseller: true },
      { name: 'Tandoori Chicken', description: 'Yoghurt-marinated, cooked in the tandoor.', price: 320, category: 'Kebabs', isVeg: false },
      { name: 'Mutton Korma', description: 'Slow-cooked in a cashew and onion gravy.', price: 340, category: 'Curries', isVeg: false },
      { name: 'Butter Naan', description: 'Soft, brushed with Amul butter.', price: 70, category: 'Breads', isVeg: true },
    ],
  },
];

const HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * Photographs for content that does not exist in production.
 *
 * `loadProductionImages` is the first choice because the four original
 * restaurants really are live and their real photography is the most honest
 * thing to show. A restaurant added to `RESTAURANTS` here has no production
 * document at all, so that lookup misses and this file is what answers — it is
 * written by `upload-food-images.mjs` from the same openly-licensed photos.
 *
 * The keys deliberately mirror production's own (`slug` and `slug/dish name`)
 * so the call sites can fall through one source to the next without knowing
 * which one is speaking. A missing or unreadable file is not an error: the
 * seeder still writes correct documents, just with a placeholder cover, which
 * is a far better failure than refusing to seed.
 *
 * Values are normalised to the same shapes production returns — a cover is a
 * URL string, a dish is `{ imageUrl, imageCredit }` — so nothing downstream has
 * to branch on where the photo came from.
 */
function loadSeedImages() {
  const empty = { covers: new Map(), logos: new Map(), dishes: new Map() };
  try {
    const raw = JSON.parse(readFileSync('tools/food-images/seed-images.json', 'utf8'));
    const covers = new Map();
    const logos = new Map();
    const dishes = new Map();

    for (const [slug, entry] of Object.entries(raw.covers ?? {})) {
      covers.set(slug, entry.url ?? null);
      logos.set(slug, entry.logo ?? null);
    }
    for (const [key, entry] of Object.entries(raw.dishes ?? {})) {
      dishes.set(key, { imageUrl: entry.url ?? null, imageCredit: entry.credit ?? null });
    }

    console.log(`loaded ${covers.size} covers and ${dishes.size} dish photos from seed-images.json`);
    return { covers, logos, dishes };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`could not read seed-images.json (${error.message}); using placeholders`);
    }
    return empty;
  }
}

/**
 * Fails fast with an actionable message when the emulator is not up, instead
 * of hanging on a socket connect for two minutes.
 */
async function assertEmulatorsRunning() {
  for (const [url, label] of [
    ['http://127.0.0.1:8080', 'Firestore'],
    ['http://127.0.0.1:9199', 'Storage'],
    ['http://127.0.0.1:9099', 'Auth'],
  ]) {
    try {
      await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), HANDSHAKE_TIMEOUT_MS)),
      ]);
    } catch {
      console.error(
        `\n${label} emulator is not responding on ${url}.\n` +
          `Start it first:  npm run emulators\n` +
          `Then run this again:  npm run seed\n`,
      );
      process.exit(1);
    }
  }
}

/**
 * Signs in as the seed owner, creating the account on first run.
 *
 * This goes through the Auth SDK rather than raw REST so the id token is
 * attached to *both* the Firestore and Storage clients automatically — passing
 * it to one by hand silently leaves the other unauthenticated, which surfaces
 * as a confusing `permission-denied` on write.
 */
async function signInSeedOwner() {
  const auth = getAuth(app);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      SEED_OWNER.email,
      SEED_OWNER.password,
    );
    return credential.user;
  } catch (error) {
    // The emulator keeps users in memory, so a restart wipes the account.
    // Create it again, then sign in to get a proper session.
    if (error?.code !== 'auth/user-not-found' && error?.code !== 'auth/invalid-credential') {
      throw error;
    }
    await createUserWithEmailAndPassword(auth, SEED_OWNER.email, SEED_OWNER.password);
    const credential = await signInWithEmailAndPassword(
      auth,
      SEED_OWNER.email,
      SEED_OWNER.password,
    );
    return credential.user;
  }
}

/**
 * Photo URLs, read from the production project.
 *
 * The emulator has no Cloudinary upload path of its own — the app uploads
 * through Cloudinary directly, so emulated Firebase Storage is never used for
 * images. Rather than ship generated placeholders, the seed borrows the public
 * CDN URLs so a local run matches what is deployed.
 *
 * `restaurants`, `menuItems` and `highlightDishes` are all `allow read: if true`,
 * so this needs no credentials. It reads *images*, never orders or users.
 *
 * Failure here is not fatal: the seed falls back to `null` and the UI shows its
 * own placeholder. A network hiccup should not stop someone seeding.
 */
async function loadProductionImages() {
  const empty = { dishes: new Map(), highlights: [], covers: new Map(), logos: new Map() };
  try {
    const prodApp = initializeApp(
      {
        apiKey: FIREBASE_API_KEY,
        projectId: PROJECT_ID,
        storageBucket: `${PROJECT_ID}.firebasestorage.app`,
      },
      'zaika-production-images',
    );
    const prodDb = getFirestore(prodApp);

    const dishes = new Map();
    const covers = new Map();
    const logos = new Map();
    const highlights = [];

    const restaurants = await getDocs(collection(prodDb, 'restaurants'));
    for (const restaurant of restaurants.docs) {
      covers.set(restaurant.id, restaurant.data().coverImageUrl ?? null);
      logos.set(restaurant.id, restaurant.data().logoImageUrl ?? null);

      const menu = await getDocs(
        collection(prodDb, 'restaurants', restaurant.id, 'menuItems'),
      );
      for (const item of menu.docs) {
        const data = item.data();
        dishes.set(`${restaurant.id}/${data.name}`, {
          imageUrl: data.imageUrl ?? null,
          imageCredit: data.imageCredit ?? null,
        });
      }
    }

    const curated = await getDocs(collection(prodDb, 'highlightDishes'));
    for (const entry of curated.docs) {
      highlights.push({ id: entry.id, ...entry.data() });
    }
    highlights.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    console.log(
      `loaded ${dishes.size} dish photos and ${highlights.length} highlights from production`,
    );
    return { dishes, highlights, covers, logos };
  } catch (error) {
    console.warn(`could not load production images (${error.code ?? error.message}); using placeholders`);
    return empty;
  }
}

async function seed() {
  // Borrow the real photos before writing anything, so every document written
  // below already has its image URL.
  //
  // Two sources, tried in order: production for the restaurants that are
  // genuinely live, then the local registry for everything added here. Both are
  // read up front so a document is never written half-populated.
  const productionImages = await loadProductionImages();
  const seedImages = loadSeedImages();

  const owner = await signInSeedOwner();
  const uid = owner.uid;
  console.log(`signed in as ${SEED_OWNER.email} (uid ${uid})`);

  const firestore = getFirestore(app);
  const storage = getStorage(app);

  /** Collected so the owner profile can link every seeded restaurant. */
  const restaurantIds = [];

  for (const entry of RESTAURANTS) {
    // Deterministic id derived from the slug, so re-running the seeder
    // overwrites the same document instead of piling up duplicates.
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const restaurantRef = doc(firestore, 'restaurants', slug);

    // The real photograph when one can be found: production first, because
    // those four restaurants genuinely exist there, then the local registry for
    // anything added to `RESTAURANTS` since. Only a genuine miss on both falls
    // back to the placeholder.
    //
    // The placeholder is a 1x1 transparent PNG, so writing it unconditionally
    // meant every local card rendered a flat gradient while the dish photos
    // beside it were real — which is exactly the complaint that made this
    // visible: a dish tile shows biryani, the click lands on a detail page
    // whose cover is an empty box, and it reads as "the image changed".
    const realCover = productionImages.covers.get(restaurantRef.id) ?? seedImages.covers.get(restaurantRef.id);
    const realLogo = productionImages.logos.get(restaurantRef.id) ?? seedImages.logos.get(restaurantRef.id);
    const coverUrl = realCover ?? (await upload(
      storage,
      `images/restaurants/${uid}/${restaurantRef.id}-cover.png`,
      PLACEHOLDER_PNG,
    ));
    const logoUrl = realLogo ?? (await upload(
      storage,
      `images/restaurants/${uid}/${restaurantRef.id}-logo.png`,
      PLACEHOLDER_PNG,
    ));
    console.log(
      realCover
        ? `   ${restaurantRef.id}: cover from ${productionImages.covers.has(restaurantRef.id) ? 'production' : 'seed-images.json'}`
        : `   ${restaurantRef.id}: no cover anywhere, using placeholder`,
    );

    const { menu, ...details } = entry;
    const restaurantData = {
      ...details,
      slug,
      ownerId: uid,
      logoImageUrl: logoUrl,
      coverImageUrl: coverUrl,
      modes: ['delivery', 'pickup'],
      openingHours: { open: 570, close: 1380 },
      isActive: true,
      updatedAt: serverTimestamp(),
    };

    // `createdAt` is immutable by rule, so it is only written on first create.
    // Writing it again on a re-run would be rejected — correctly.
    const before = await getDoc(restaurantRef);
    if (before.exists()) {
      await updateDoc(restaurantRef, restaurantData);
    } else {
      await setDocument(restaurantRef, { ...restaurantData, createdAt: serverTimestamp() });
    }

    // Menu in a batch: one round trip per restaurant instead of one per dish.
    // Items use a deterministic id too, so re-seeding updates rather than
    // appends a second copy of every dish.
    const batch = writeBatch(firestore);
    menu.forEach((item, index) => {
      const itemId = `${slug}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      // Photos come from the production project rather than being generated
      // here, so local development looks like the real site instead of a wall
      // of placeholders. These are public CDN URLs — no user data crosses over,
      // and both `restaurants` and `highlightDishes` are world-readable.
      //
      // A dish on a restaurant production has never heard of misses both
      // lookups and takes the local registry's copy instead, which is how a
      // newly added menu item gets a photograph without anything being written
      // to the live project.
      const photoKey = `${restaurantRef.id}/${item.name}`;
      const photo = productionImages.dishes.get(photoKey) ?? seedImages.dishes.get(photoKey);
      batch.set(
        doc(firestore, 'restaurants', restaurantRef.id, 'menuItems', itemId),
        {
          ...item,
          restaurantId: restaurantRef.id,
          imageUrl: photo?.imageUrl ?? null,
          imageCredit: photo?.imageCredit ?? null,
          isAvailable: true,
          rating: null,
          order: index,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();

    restaurantIds.push(restaurantRef.id);
    console.log(`seeded ${entry.name} (${menu.length} dishes)`);
  }

  // Curated dishes for the home page strip and the hero banner. Without these
  // the banner renders nothing locally, which makes it impossible to work on the
  // one screen the change is about.
  if (productionImages.highlights.length > 0) {
    for (const highlight of productionImages.highlights) {
      await setDocument(doc(firestore, 'highlightDishes', highlight.id), {
        ...highlight,
        updatedAt: serverTimestamp(),
      });
    }
    console.log(`seeded ${productionImages.highlights.length} highlight dishes`);
  } else {
    console.log('no highlight dishes available — the hero banner will be empty');
  }

  // The profile is written exactly the way the app writes it: a plain
  // customer first, then promoted to owner once restaurants exist. Writing
  // `role: 'owner'` on create is rejected by the rules on purpose — otherwise
  // anyone could self-register as an owner.
  //
  // Re-running the seeder must be safe, and the rules deliberately forbid the
  // owner -> customer downgrade, so an existing profile is left alone apart
  // from linking the newly seeded restaurants.
  const profileRef = doc(firestore, 'users', uid);
  const existing = await getDoc(profileRef);

  if (!existing.exists()) {
    await setDocument(profileRef, {
      uid: uid,
      email: SEED_OWNER.email,
      displayName: SEED_OWNER.displayName,
      phone: '9876543210',
      photoURL: null,
      role: 'customer',
      restaurantIds: [],
      defaultAddressId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('created owner profile as customer');
  } else {
    console.log('owner profile already exists — reusing it');
  }

  const currentIds = existing.data()?.restaurantIds ?? [];
  const merged = [...new Set([...currentIds, ...restaurantIds])];

  if (merged.length !== currentIds.length || existing.data()?.role !== 'owner') {
    await updateDoc(profileRef, {
      role: 'owner',
      restaurantIds: merged,
      updatedAt: serverTimestamp(),
    });
    console.log(`promoted profile to owner with ${merged.length} restaurant(s)`);
  }

  console.log(`\nDone. Log in with ${SEED_OWNER.email} / ${SEED_OWNER.password}`);
  console.log('Restart the emulator UI to see the data.');

  // The Firestore/Auth/Storage SDKs hold keep-alive sockets open, so the
  // process would hang forever after the work is done. Exit explicitly.
  process.exit(0);
}

async function setDocument(ref, data) {
  return setDoc(ref, data);
}

async function upload(storage, path, bytes) {
  try {
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, bytes, { contentType: 'image/png' });
    // The SDK mints the correct download token. Hand-building the URL and
    // guessing the token produces a link that 404s in the browser.
    return await getDownloadURL(objectRef);
  } catch (error) {
    console.warn(`storage upload failed for ${path}: ${error.message}`);
    return null;
  }
}

if (USE_EMULATORS) {
  await assertEmulatorsRunning();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
