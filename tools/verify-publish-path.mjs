/**
 * Exercises `publishRestaurant` against the real project using the same rules
 * the app runs under, so a failure here is a genuine app/rules problem rather
 * than a browser-automation artefact.
 *
 * Creates one test restaurant, prints the result, then removes it.
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { readFileSync } from 'node:fs';

const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const firebaseBlock = /firebase:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const cloudinaryBlock = /cloudinary:\s*\{([\s\S]*?)\n\s*\}/.exec(envSource)[1];
const field = (block, key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(block)[1];

const PROJECT_ID = field(firebaseBlock, 'projectId');
const CLOUD_NAME = field(cloudinaryBlock, 'cloudName');
const UPLOAD_PRESET = field(cloudinaryBlock, 'uploadPreset');
const CLOUDINARY_API_KEY = field(cloudinaryBlock, 'apiKey');

/** Mirrors CloudinaryImageStorageService.post(). */
async function uploadToCloudinary(uid, filePath) {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'publish-path-test.jpg');
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', `zaika-hub/restaurants/${uid}`);
  form.append('public_id', 'publish-path-test-' + Date.now());

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload?api_key=${CLOUDINARY_API_KEY}`,
    { method: 'POST', body: form },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`cloudinary upload failed: ${JSON.stringify(payload.error ?? payload)}`);
  }
  return payload.secure_url;
}

const app = initializeApp({
  apiKey: field(firebaseBlock, 'apiKey'),
  authDomain: field(firebaseBlock, 'authDomain'),
  projectId: PROJECT_ID,
  storageBucket: field(firebaseBlock, 'storageBucket'),
  messagingSenderId: field(firebaseBlock, 'messagingSenderId'),
  appId: field(firebaseBlock, 'appId'),
});

// The real project is used here — the point is to test the real rules.
void connectAuthEmulator;
void connectFirestoreEmulator;
void connectStorageEmulator;

const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

const EMAIL = 'owner.test@zaikahub.app';
const PASSWORD = 'TestPass123';

const TEST_NAME = 'Publish Path Test';

async function run() {
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const uid = cred.user.uid;
  console.log(`signed in: ${uid}`);

  // 1. Image upload, exactly as the active provider does.
  const coverImageUrl = await uploadToCloudinary(
    uid,
    'C:/Users/PC24/AppData/Local/Temp/zaika-hub-test-upload.jpg',
  );
  console.log(`1. image upload     -> OK`);
  console.log(`   ${coverImageUrl}`);

  // 2. Restaurant create, exactly as `RestaurantService.createRestaurant` does.
  const restaurantRef = doc(collection(firestore, 'restaurants'));
  await setDoc(restaurantRef, {
    ownerId: uid,
    name: TEST_NAME,
    slug: 'publish-path-test',
    cuisines: ['Pizza'],
    priceBand: 'mid',
    rating: 0,
    ratingCount: 0,
    deliveryTimeMinutes: 30,
    costForTwo: 500,
    coverImageUrl,
    logoImageUrl: null,
    city: 'Bengaluru',
    area: 'Koramangala',
    address: '80 Feet Road',
    modes: ['delivery'],
    openingHours: { open: 570, close: 1380 },
    featured: false,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log(`2. restaurant create-> OK (${restaurantRef.id})`);

  // 3. Owner promotion, exactly as `UserService.linkRestaurant` does.
  await updateDoc(doc(firestore, 'users', uid), {
    restaurantIds: [restaurantRef.id],
    role: 'owner',
    updatedAt: serverTimestamp(),
  });
  console.log(`3. owner promotion  -> OK`);

  // 4. Menu item create.
  await setDoc(doc(collection(firestore, 'restaurants', restaurantRef.id, 'menuItems')), {
    restaurantId: restaurantRef.id,
    name: 'Test Pizza',
    description: 'Write test',
    price: 250,
    imageUrl: null,
    category: 'Classic',
    isVeg: true,
    isAvailable: true,
    rating: null,
    isBestseller: false,
    order: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log(`4. menu item create -> OK`);

  // Confirm the image is publicly readable.
  const fetched = await fetch(coverImageUrl);
  console.log(`\npublic GET image    -> ${fetched.status} ${fetched.headers.get('content-type')}`);

  // Cleanup.
  await deleteDoc(restaurantRef);
  await updateDoc(doc(firestore, 'users', uid), { restaurantIds: [], role: 'customer' });
  console.log('\ncleanup done — test restaurant removed, role reset to customer');
}

run().catch((error) => {
  console.error('\nFAILED:', error.code ?? error.name, '-', error.message);
  process.exit(1);
});