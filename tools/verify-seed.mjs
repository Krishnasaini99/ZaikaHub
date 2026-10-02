/**
 * Verifies what the seeder actually wrote, straight from the emulator REST
 * surface. Run with the emulator suite up:  node tools/verify-seed.mjs
 */
const PROJECT = 'zaika-hub-prod';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const STORAGE = 'http://127.0.0.1:9199';

/** `(default)` must be percent-encoded in the REST path. */
const DB = '%28default%29';

const login = await fetch(
  `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@zaikahub.test',
      password: 'Owner12345',
      returnSecureToken: true,
    }),
  },
);

if (!login.ok) {
  console.error('cannot sign in as seed owner — run `npm run seed` first');
  process.exit(1);
}

const { idToken, localId } = await login.json();
console.log(`signed in as ${localId}\n`);

const headers = { Authorization: `Bearer ${idToken}` };

/** Firestore REST returns typed field wrappers; flatten to plain JS values. */
function decodeValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) return (v.arrayValue.values ?? []).map(decodeValue);
  if (v.mapValue !== undefined) return decodeValue(v.mapValue);
  return v;
}

function decodeDoc(d) {
  return {
    id: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])),
  };
}

async function list(collection) {
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/${DB}/documents/${collection}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`  ! list ${collection} -> ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return (data.documents ?? []).map(decodeDoc);
}

/** Reads a single document. */
async function get(path) {
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/${DB}/documents/${path}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return decodeDoc(await res.json());
}

const restaurants = await list('restaurants');
console.log(`restaurants: ${restaurants.length}`);
for (const r of restaurants) {
  const menu = await list(`restaurants/${r.id}/menuItems`);
  console.log(`  - ${r.id}`);
  console.log(`      name=${r.name}  cuisines=${JSON.stringify(r.cuisines)}  priceBand=${r.priceBand}`);
  console.log(`      rating=${r.rating}  deliveryTime=${r.deliveryTimeMinutes}min  costForTwo=${r.costForTwo}`);
  console.log(`      featured=${r.featured}  isActive=${r.isActive}  owner=${r.ownerId === localId}`);
  console.log(`      coverImageUrl=${r.coverImageUrl ? 'set' : 'MISSING'}  menuItems=${menu.length}`);
}

// The `users` collection cannot be listed even by the signed-in owner — the
// rules only permit reading your own document. That denial is the point, so
// this reads the single doc instead.
const profile = await get(`users/${localId}`);
console.log(`\nusers/${localId}:`);
if (!profile) {
  console.log('  (not readable)');
} else {
  console.log(`  - ${profile.email}  role=${profile.role}`);
  console.log(`      displayName=${profile.displayName}  phone=${profile.phone}`);
  console.log(`      restaurantIds=${JSON.stringify(profile.restaurantIds)}`);
}

// `storage.rules` allows object reads but not bucket listing, so a `list`
// returning 403 is the expected result. Fetch a known object instead.
const sample = restaurants.find((r) => r.coverImageUrl)?.coverImageUrl;
console.log('\ncover image download check:');
if (!sample) {
  console.log('  no coverImageUrl found');
} else {
  const res = await fetch(sample);
  const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
  console.log(`  GET -> ${res.status}, ${bytes} bytes, ${res.headers.get('content-type')}`);
}
