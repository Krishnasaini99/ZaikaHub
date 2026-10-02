/**
 * Builds the `highlightDishes` collection from the existing menus.
 *
 * WHY A SCRIPT AND NOT A FLAG ON THE MENU ITEM
 * --------------------------------------------
 * Firestore cannot query a subcollection across all its parents, so a "show me
 * the best dishes everywhere" strip has to come from a top-level collection.
 * This script derives that collection from the menus that already exist, which
 * keeps the two in step at seed time instead of leaving a curator to hand-copy
 * fifteen rows.
 *
 * Re-run it after adding restaurants or changing which dishes should be
 * promoted. It only writes what differs, so it is safe to run repeatedly.
 *
 * Run: node tools/seed-highlight-dishes.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const firebaseBlock = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const field = (key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(firebaseBlock)[1];

const app = initializeApp({
  apiKey: field('apiKey'),
  authDomain: field('authDomain'),
  projectId: field('projectId'),
  storageBucket: field('storageBucket'),
  messagingSenderId: field('messagingSenderId'),
  appId: field('appId'),
});

const firestore = getFirestore(app);

/**
 * Which dishes get promoted, and in what order.
 *
 * Hand-picked rather than "everything": the home page strip is a hook, and a
 * shelf of fifteen near-identical tiles would read as filler. `null` here means
 * the dish is deliberately left out.
 */
const CURATED = [
  'Hyderabadi Chicken Biryani',
  'Butter Naan',
  'Margherita',
  'Tandoori Paneer Pizza',
  'Veg Manchurian',
  'Chicken Hakka Noodles',
  'Rasmalai',
  'Belgian Chocolate Brownie',
  'Samosa',
  'Gulab Jamun',
  'Paneer Tikka Masala',
  'Garlic Breadsticks',
];

const wanted = new Set(CURATED);

async function main() {
  const restaurants = await getDocs(collection(firestore, 'restaurants'));
  const highlights = [];

  for (const restaurant of restaurants.docs) {
    const menu = await getDocs(collection(firestore, 'restaurants', restaurant.id, 'menuItems'));

    for (const item of menu.docs) {
      const data = item.data();
      const rank = CURATED.indexOf(data.name);
      if (rank === -1 || !wanted.has(data.name)) {
        continue;
      }

      highlights.push({
        id: `${restaurant.id}__${item.id}`,
        restaurantId: restaurant.id,
        restaurantName: data.restaurantName ?? restaurant.data().name,
        menuItemId: item.id,
        name: data.name,
        description: data.description ?? '',
        price: data.price ?? 0,
        // A dish with no photo would render as a grey tile in the strip, which
        // is worse than omitting it from a strip that is meant to sell the food.
        imageUrl: data.imageUrl ?? null,
        isVeg: data.isVeg === true,
        rank,
        imageCredit: data.imageCredit ?? null,
      });
    }
  }

  highlights.sort((a, b) => a.rank - b.rank);

  const highlightsRef = collection(firestore, 'highlightDishes');
  const existing = await getDocs(highlightsRef);
  const wantedIds = new Set(highlights.map((h) => h.id));

  for (const highlight of highlights) {
    await setDoc(doc(firestore, 'highlightDishes', highlight.id), {
      ...highlight,
      updatedAt: serverTimestamp(),
    });
  }

  // Remove rows left over from a previous curation, so the strip cannot show a
  // dish that has since been taken off the menu or un-curated.
  let removed = 0;
  for (const stale of existing.docs) {
    if (!wantedIds.has(stale.id)) {
      await deleteDoc(stale.ref);
      removed += 1;
    }
  }

  const withoutPhoto = highlights.filter((h) => !h.imageUrl);
  console.log(`${highlights.length} highlight dishes written, ${removed} removed`);
  if (withoutPhoto.length > 0) {
    console.log('no photo (will render a placeholder):');
    for (const dish of withoutPhoto) {
      console.log(`  ${dish.name}`);
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});