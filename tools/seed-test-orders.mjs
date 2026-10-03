// Test helper: places a few skewed orders in the emulator so the most-sold
// ranking has something real to chew on.
//
// Two accounts, matching the seed data: a customer places, the owner delivers.
// Statuses advance the honest way (placed -> ... -> delivered through the
// rules) rather than by writing `delivered` outright, so this also proves the
// rules let the flow happen.
//
// The skew is deliberate: Butter Chicken x4 total must outrank Biryani x2 and
// Naan x1 on Zaika House, and one `cancelled` order must count for nothing.
// If the home page shows any other order, the ranking is broken.
//
// Usage (emulators running):
//   node tools/seed-test-orders.mjs
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'fake-api-key-for-emulator',
  authDomain: 'zaika-hub-prod.firebaseapp.com',
  projectId: 'zaika-hub-prod',
});
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const CUSTOMER = { email: 'buyer@zaikahub.test', password: 'Buyer12345' };
const OWNER = { email: 'owner@zaikahub.test', password: 'Owner12345' };

async function ensureUser(credential) {
  try {
    await signInWithEmailAndPassword(auth, credential.email, credential.password);
  } catch {
    await createUserWithEmailAndPassword(auth, credential.email, credential.password);
  }
  return auth.currentUser;
}

async function main() {
  // The customer places three orders with a deliberate skew.
  const customer = await ensureUser(CUSTOMER);
  const ordersRef = collection(db, 'orders');
  const base = {
    userId: customer.uid,
    restaurantId: 'zaika-house',
    restaurantName: 'Zaika House',
    restaurantCoverImageUrl: null,
    address: { label: 'Home', line1: '1 Main', line2: '', city: 'Bengaluru', pincode: '560001' },
    totals: { itemTotal: 0, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 0 },
    paymentMethod: 'cod',
    placedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    etaMinutes: null,
    cancelledReason: null,
  };
  const line = (menuItemId, name, quantity) => ({
    menuItemId,
    name,
    price: 100,
    quantity,
    lineTotal: 100 * quantity,
    isVeg: true,
  });

  const o1 = await addDoc(ordersRef, {
    ...base,
    status: 'placed',
    items: [line('zaika-house-butter-chicken', 'Butter Chicken', 3)],
  });
  const o2 = await addDoc(ordersRef, {
    ...base,
    status: 'placed',
    items: [
      line('zaika-house-butter-chicken', 'Butter Chicken', 1),
      line('zaika-house-hyderabadi-chicken-biryani', 'Hyderabadi Chicken Biryani', 2),
      line('zaika-house-butter-naan', 'Butter Naan', 1),
    ],
  });
  // Cancelled: must count for nothing, however large.
  const o3 = await addDoc(ordersRef, {
    ...base,
    status: 'placed',
    items: [line('zaika-house-veg-dum-biryani', 'Veg Dum Biryani', 9)],
  });
  console.log('placed 3 orders');

  // The owner delivers two and cancels the third.
  await ensureUser(OWNER);
  await updateDoc(doc(db, 'orders', o1.id), { status: 'delivered', updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'orders', o2.id), { status: 'delivered', updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'orders', o3.id), {
    status: 'cancelled',
    cancelledReason: 'test order',
    updatedAt: serverTimestamp(),
  });
  console.log('delivered 2, cancelled 1');

  // Expected ranking for zaika-house: Butter Chicken 4, Biryani 2, Naan 1.
  const snap = await getDocs(
    query(collection(db, 'orders'), where('restaurantId', '==', 'zaika-house')),
  );
  console.log(`zaika-house orders in emulator: ${snap.size}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.code ?? error.message);
  process.exit(1);
});
