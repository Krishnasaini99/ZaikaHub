// One-time migration: publish the four restaurants (and two extra dishes) that
// `tools/seed.mjs` added locally, to the production project.
//
// Why this exists at all: the seeder writes to the Firestore *emulator*, and
// the photo pipeline (`upload-food-images.mjs --seed-only`) uploads to
// Cloudinary but never writes a Firestore document. So after those two run,
// the images are live on the CDN and the emulator shows eight restaurants,
// while production still shows four. This script closes that gap.
//
// What it does, and — just as important — what it refuses to do:
//   - CREATES the four missing restaurants with the signed-in user as owner.
//     `firestore.rules` lets any signed-in user create a restaurant for
//     themselves, so no rule change and no admin is involved.
//   - CREATES the missing menu items (16 for the new houses, plus Butter
//     Chicken and Spring Rolls for the two originals that gained a dish).
//   - NEVER updates or deletes anything that already exists. An existing
//     restaurant or dish is left byte-for-byte alone, which makes re-running
//     safe: the second run reports "already there" for everything and writes
//     nothing.
//   - NEVER touches `highlightDishes`. Those writes are admin-only by rule,
//     and deciding what the home page merchandises is editorial, not migration.
//
// Safety catch: before writing anything it checks that the signed-in account
// actually owns the four restaurants production already has. If someone runs
// this with the wrong credentials, every menu-item write would fail on
// `managesRestaurant` anyway — but failing *loudly before the first write*
// beats discovering it from four half-written restaurants.
//
// Menus mirror `RESTAURANTS` in `tools/seed.mjs` (the source of truth for
// names, prices and descriptions); photo URLs come from
// `tools/food-images/seed-images.json` (the source of truth for images).
// If the two ever disagree about a dish name, the lookup below misses and the
// script aborts rather than writing a photo-less menu item.
//
// Usage:
//   node tools/publish-new-restaurants.mjs
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import { signInWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'zaika-hub-prod';

// The real web config, read the same way `upload-food-images.mjs` reads it:
// the public values out of the production environment file. These are the
// browser keys — public by design — not secrets.
const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const firebaseBlock = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const field = (block, key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(block)[1];

const OWNER = { email: 'owner@zaikahub.app', password: 'Owner12345' };

const app = initializeApp({
  apiKey: field(firebaseBlock, 'apiKey'),
  authDomain: field(firebaseBlock, 'authDomain'),
  projectId: field(firebaseBlock, 'projectId'),
  storageBucket: field(firebaseBlock, 'storageBucket'),
  messagingSenderId: field(firebaseBlock, 'messagingSenderId'),
  appId: field(firebaseBlock, 'appId'),
});
const auth = getAuth(app);
const db = getFirestore(app);

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const itemIdOf = (slug, name) => `${slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// Mirrors `RESTAURANTS` in tools/seed.mjs for the four houses production has
// never heard of, plus the one extra dish each on the two originals.
const NEW_RESTAURANTS = [
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

// Dishes added to houses production already has. `order` continues the
// existing sequence so they appear at the end of their categories.
const EXTRA_DISHES = [
  {
    slug: 'zaika-house',
    item: { name: 'Butter Chicken', description: 'Slow-simmered tomato and cream gravy.', price: 340, category: 'Curries', isVeg: false, isBestseller: true },
  },
  {
    slug: 'wok-this-way',
    item: { name: 'Spring Rolls', description: 'Deep-fried rolls with shredded vegetables.', price: 160, category: 'Starters', isVeg: true, isBestseller: true },
  },
];

function fail(message) {
  console.error(`ABORTED: ${message}`);
  process.exit(1);
}

async function main() {
  const seedImages = JSON.parse(readFileSync('tools/food-images/seed-images.json', 'utf8'));

  const credential = await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password);
  const uid = credential.user.uid;
  console.log(`signed in as ${OWNER.email} (uid ${uid})`);

  // The safety catch: every write below depends on this account owning the
  // restaurants, so prove it before the first write, not after the fourth.
  const existing = await getDocs(collection(db, 'restaurants'));
  const strangers = existing.docs.filter((d) => d.data().ownerId !== uid);
  if (strangers.length > 0) {
    fail(
      `${OWNER.email} does not own ${strangers.map((d) => d.id).join(', ')} — ` +
        'refusing to write. Run with the account that owns production.',
    );
  }
  console.log(`ownership check passed (${existing.size} existing restaurants all owned here)`);

  let createdRestaurants = 0;
  let createdDishes = 0;

  for (const entry of NEW_RESTAURANTS) {
    const slug = slugOf(entry.name);
    const ref = doc(db, 'restaurants', slug);
    const cover = seedImages.covers[slug];
    if (!cover?.url) {
      fail(`no cover for ${slug} in seed-images.json — upload it first (upload-food-images.mjs --seed-only)`);
    }

    if ((await getDoc(ref)).exists()) {
      console.log(`   ${slug}: restaurant already there, leaving it alone`);
    } else {
      const { menu, ...details } = entry;
      await setDoc(ref, {
        ...details,
        slug,
        ownerId: uid,
        logoImageUrl: cover.logo ?? null,
        coverImageUrl: cover.url,
        imageCredit: cover.credit ?? null,
        modes: ['delivery', 'pickup'],
        openingHours: { open: 570, close: 1380 },
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdRestaurants += 1;
      console.log(`   ${slug}: restaurant created`);
    }

    const { menu } = entry;
    const currentMenu = await getDocs(collection(db, 'restaurants', slug, 'menuItems'));
    const have = new Set(currentMenu.docs.map((d) => d.id));
    let order = currentMenu.size;
    for (const item of menu) {
      const itemId = itemIdOf(slug, item.name);
      if (have.has(itemId)) {
        continue;
      }
      const key = `${slug}/${item.name}`;
      const photo = seedImages.dishes[key];
      if (!photo?.url) {
        fail(`no photo for ${key} in seed-images.json — upload it first (upload-food-images.mjs --seed-only)`);
      }
      await setDoc(doc(db, 'restaurants', slug, 'menuItems', itemId), {
        ...item,
        restaurantId: slug,
        imageUrl: photo.url,
        imageCredit: photo.credit ?? null,
        isAvailable: true,
        rating: null,
        order: order++,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdDishes += 1;
      console.log(`   ${slug}: dish created — ${item.name}`);
    }
  }

  for (const { slug, item } of EXTRA_DISHES) {
    const itemId = itemIdOf(slug, item.name);
    const ref = doc(db, 'restaurants', slug, 'menuItems', itemId);
    if ((await getDoc(ref)).exists()) {
      console.log(`   ${slug}: ${item.name} already there, leaving it alone`);
      continue;
    }
    const key = `${slug}/${item.name}`;
    const photo = seedImages.dishes[key];
    if (!photo?.url) {
      fail(`no photo for ${key} in seed-images.json — upload it first (upload-food-images.mjs --seed-only)`);
    }
    const currentMenu = await getDocs(collection(db, 'restaurants', slug, 'menuItems'));
    await setDoc(ref, {
      ...item,
      restaurantId: slug,
      imageUrl: photo.url,
      imageCredit: photo.credit ?? null,
      isAvailable: true,
      rating: null,
      order: currentMenu.size,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    createdDishes += 1;
    console.log(`   ${slug}: dish created — ${item.name}`);
  }

  console.log(`\nDone: ${createdRestaurants} restaurants and ${createdDishes} dishes created, nothing else touched.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});
