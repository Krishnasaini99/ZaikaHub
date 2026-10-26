// Audits the highlightDishes collection against the live menus it points at.
//
// Each highlight carries restaurantId + menuItemId. If a menu item was renamed
// or reseeded meanwhile, the home page click lands on the restaurant but the
// deep link can no longer find the dish — which reads to a visitor as "clicked
// one dish, another opened". Read-only over public rules.
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'fake', projectId: 'zaika-hub-prod' });
const db = getFirestore(app);

const highlights = await getDocs(collection(db, 'highlightDishes'));

const menuCache = new Map();
async function menuIdsOf(restaurantId) {
  if (!menuCache.has(restaurantId)) {
    const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'menuItems'));
    menuCache.set(restaurantId, new Set(snap.docs.map((d) => d.id)));
  }
  return menuCache.get(restaurantId);
}

let ok = 0;
const broken = [];
for (const h of highlights.docs) {
  const d = h.data();
  const restaurantId = h.id.split('__')[0] ?? d.restaurantId;
  const ids = await menuIdsOf(restaurantId);
  const row = {
    docId: h.id,
    name: d.name,
    restaurantId,
    menuItemId: d.menuItemId,
    exists: ids.has(d.menuItemId),
  };
  if (row.exists) {
    ok += 1;
    console.log(`OK       ${row.name.padEnd(34)} -> ${restaurantId}/${menuItemIdOf(row)}`);
  } else {
    broken.push(row);
    console.log(`BROKEN   ${row.name.padEnd(34)} -> ${restaurantId}/${menuItemIdOf(row)} (missing)`);
  }
}

console.log(`\n${ok} valid, ${broken.length} broken`);
process.exit(broken.length === 0 ? 0 : 1);

function menuItemIdOf(row) {
  return row.menuItemId;
}
