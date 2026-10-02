/**
 * Populates the live project with realistic sample data and walks the whole
 * order lifecycle once, so the app can be reviewed with content in it.
 *
 * Mirrors what the app's services do, against the real project and the real
 * Firestore rules — if this passes, the app's own code path passes.
 *
 * Run: node tools/seed-live.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { gradientPng } from './png.mjs';

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

const OWNER = { email: 'owner@zaikahub.app', password: 'Owner12345', name: 'Zaika Owner' };
const CUSTOMER = { email: 'guest@zaikahub.app', password: 'Guest12345', name: 'Aarav Sharma' };

// ----------------------------------------------------------------- cloudinary

async function upload(ownerId, folder, publicId, png) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${publicId}.png`);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', `zaika-hub/${folder}/${ownerId}`);
  form.append('public_id', publicId);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload?api_key=${API_KEY}`,
    { method: 'POST', body: form },
  );
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`upload failed: ${JSON.stringify(payload.error ?? payload)}`);
  }
  return payload.secure_url;
}

// ---------------------------------------------------------------------- users

async function ensureUser({ email, password, name }) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(firestore, 'users', credential.user.uid), {
      uid: credential.user.uid,
      email,
      displayName: name,
      phone: '9876543210',
      photoURL: null,
      role: 'customer',
      restaurantIds: [],
      defaultAddressId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`created  ${email}`);
    return credential.user.uid;
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') {
      throw error;
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log(`reusing  ${email}`);
    return credential.user.uid;
  }
}

// ---------------------------------------------------------------------- data

const RESTAURANTS = [
  {
    name: 'Zaika House', cuisines: ['North Indian', 'Biryani'], priceBand: 'mid',
    rating: 4.5, ratingCount: 1284, deliveryTimeMinutes: 32, costForTwo: 600,
    area: 'Koramangala', city: 'Bengaluru', address: '80 Feet Road, 4th Block',
    cover: ['#e23744', '#ff8a5c'], featured: true,
    menu: [
      { name: 'Hyderabadi Chicken Biryani', description: 'Dum-cooked basmati rice with spiced chicken and fried onions.', price: 320, category: 'Biryani', isVeg: false, isBestseller: true },
      { name: 'Paneer Tikka Masala', description: 'Charred paneer in a spiced tomato and cashew gravy.', price: 260, category: 'Curries', isVeg: true },
      { name: 'Veg Dum Biryani', description: 'Seasonal vegetables and saffron basmati rice.', price: 240, category: 'Biryani', isVeg: true },
      { name: 'Butter Naan', description: 'Soft, brushed generously with butter.', price: 60, category: 'Breads', isVeg: true },
      { name: 'Gulab Jamun', description: 'Warm khoya dumplings in cardamom syrup.', price: 120, category: 'Desserts', isVeg: true },
    ],
  },
  {
    name: 'Bombay Pizza Co.', cuisines: ['Pizza', 'Italian'], priceBand: 'mid',
    rating: 4.2, ratingCount: 842, deliveryTimeMinutes: 28, costForTwo: 500,
    area: 'Indiranagar', city: 'Bengaluru', address: '12th Main, Indiranagar',
    cover: ['#ff7a18', '#ffd166'], featured: true,
    menu: [
      { name: 'Margherita', description: 'San Marzano tomato, fior di latte and basil.', price: 280, category: 'Classic', isVeg: true, isBestseller: true },
      { name: 'Tandoori Paneer Pizza', description: 'Spiced paneer, onion and green chilli.', price: 340, category: 'Speciality', isVeg: true },
      { name: 'Chicken Tikka Pizza', description: 'Roast chicken tikka with a mint drizzle.', price: 380, category: 'Speciality', isVeg: false },
      { name: 'Garlic Breadsticks', description: 'With herbed garlic butter.', price: 140, category: 'Sides', isVeg: true },
    ],
  },
  {
    name: 'Wok This Way', cuisines: ['Chinese', 'Thai'], priceBand: 'budget',
    rating: 3.8, ratingCount: 419, deliveryTimeMinutes: 40, costForTwo: 350,
    area: 'HSR Layout', city: 'Bengaluru', address: 'Sector 2, HSR Layout',
    cover: ['#06d6a0', '#118ab2'], featured: false,
    menu: [
      { name: 'Veg Manchurian', description: 'Crisp fried vegetables in a savoury sauce.', price: 180, category: 'Starters', isVeg: true },
      { name: 'Chicken Hakka Noodles', description: 'Wok-tossed noodles with julienned vegetables.', price: 220, category: 'Noodles', isVeg: false },
      { name: 'Chilli Garlic Sauce', description: 'Extra-hot dip.', price: 40, category: 'Extras', isVeg: true },
    ],
  },
  {
    name: 'Mithai Corner', cuisines: ['Desserts', 'Bakery'], priceBand: 'budget',
    rating: 4.6, ratingCount: 2311, deliveryTimeMinutes: 25, costForTwo: 250,
    area: 'Jayanagar', city: 'Bengaluru', address: '4th Block, Jayanagar',
    cover: ['#c77dff', '#e0aaff'], featured: true,
    menu: [
      { name: 'Rasmalai', description: 'Chilled saffron milk cake with rabri.', price: 150, category: 'Milk Sweets', isVeg: true, isBestseller: true },
      { name: 'Belgian Chocolate Brownie', description: 'Fudgy, with a molten centre.', price: 130, category: 'Cakes', isVeg: true },
      { name: 'Samosa', description: 'Two crisp aloo samosas with chutney.', price: 70, category: 'Savouries', isVeg: true },
    ],
  },
];

// ----------------------------------------------------------------------- run

async function run() {
  console.log('1. accounts');
  const ownerId = await ensureUser(OWNER);

  console.log('\n2. restaurants + menus');
  const restaurantIds = [];
  for (const [index, entry] of RESTAURANTS.entries()) {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const ref = doc(firestore, 'restaurants', slug);
    const coverImageUrl = await upload(
      ownerId,
      'restaurants',
      `${slug}-cover`,
      gradientPng(800, 500, entry.cover[0], entry.cover[1]),
    );
    const logoImageUrl = await upload(
      ownerId,
      'restaurants',
      `${slug}-logo`,
      gradientPng(200, 200, entry.cover[1], entry.cover[0]),
    );

    await setDoc(ref, {
      ownerId,
      name: entry.name,
      slug,
      cuisines: entry.cuisines,
      priceBand: entry.priceBand,
      rating: entry.rating,
      ratingCount: entry.ratingCount,
      deliveryTimeMinutes: entry.deliveryTimeMinutes,
      costForTwo: entry.costForTwo,
      coverImageUrl,
      logoImageUrl,
      city: entry.city,
      area: entry.area,
      address: entry.address,
      modes: ['delivery', 'pickup'],
      openingHours: { open: 570, close: 1380 },
      featured: entry.featured,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const [order, dish] of entry.menu.entries()) {
      const imageUrl = await upload(
        ownerId,
        'menu-items',
        `${slug}-${dish.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        gradientPng(400, 300, entry.cover[1], entry.cover[0]),
      );
      await setDoc(
        doc(firestore, 'restaurants', slug, 'menuItems', `${slug}-${order + 1}`),
        {
          restaurantId: slug,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          imageUrl,
          category: dish.category,
          isVeg: dish.isVeg,
          isAvailable: true,
          rating: null,
          isBestseller: dish.isBestseller ?? false,
          order,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );
    }

    restaurantIds.push(slug);
    console.log(`   ${entry.name}  (${entry.menu.length} dishes)`);
  }

  await updateDoc(doc(firestore, 'users', ownerId), {
    restaurantIds,
    role: 'owner',
    updatedAt: serverTimestamp(),
  });
  console.log(`   owner promoted, ${restaurantIds.length} restaurants linked`);

  console.log('\n3. place an order as a customer');
  await signOut(auth);
  const customerId = await ensureUser(CUSTOMER);

  const menuSnapshot = await getDocs(collection(firestore, 'restaurants', 'zaika-house', 'menuItems'));
  const dishes = menuSnapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 2);

  const lineItems = dishes.map((d) => ({
    menuItemId: d.id,
    name: d.name,
    price: d.price,
    quantity: d.name.includes('Biryani') ? 2 : 1,
    lineTotal: d.price * (d.name.includes('Biryani') ? 2 : 1),
    isVeg: d.isVeg,
  }));

  const itemTotal = round2(lineItems.reduce((sum, l) => sum + l.lineTotal, 0));
  const deliveryFee = itemTotal >= 399 ? 0 : 39;
  const taxes = round2(itemTotal * 0.05);
  const discount = round2(itemTotal * 0.1);

  const orderRef = doc(collection(firestore, 'orders'));
  await setDoc(orderRef, {
    userId: customerId,
    restaurantId: 'zaika-house',
    restaurantName: 'Zaika House',
    restaurantCoverImageUrl: null,
    items: lineItems,
    address: {
      label: 'Home',
      line1: 'Flat 402, Green Residency',
      line2: '4th Block, Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
    },
    totals: {
      itemTotal,
      deliveryFee,
      taxes,
      discount,
      grandTotal: Math.max(0, round2(itemTotal + deliveryFee + taxes - discount)),
    },
    status: 'placed',
    paymentMethod: 'cod',
    etaMinutes: null,
    cancelledReason: null,
    placedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log(`   order ${orderRef.id} placed  (total ${itemTotal + deliveryFee + taxes - discount})`);

  console.log('\n4. owner advances the order');
  await signOut(auth);
  await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password);
  for (const [index, status] of ['accepted', 'preparing', 'out_for_delivery', 'delivered'].entries()) {
    await updateDoc(orderRef, {
      status,
      ...(index === 0 ? { etaMinutes: 40 } : {}),
      updatedAt: serverTimestamp(),
    });
    console.log(`   -> ${status}`);
  }

  console.log('\nDONE');
  console.log(`  owner    ${OWNER.email} / ${OWNER.password}`);
  console.log(`  customer ${CUSTOMER.email} / ${CUSTOMER.password}`);
  process.exit(0);
}

const round2 = (n) => Math.round(n * 100) / 100;

run().catch((error) => {
  console.error('\nFAILED:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});
