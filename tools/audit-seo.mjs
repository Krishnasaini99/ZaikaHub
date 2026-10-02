/**
 * Read-only audit of what a crawler would see on the live site.
 *
 * The point is to check the *deployed* result rather than the source: meta tags
 * can be correct in `index.html` and still be missing or wrong in the bundle
 * that actually ships.
 *
 * Run: node tools/audit-seo.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://zaika-hub-prod.web.app';

// Same public origin the app uses for canonical URLs.
const envSource = readFileSync('src/environments/environment.production.ts', 'utf8');
const SITE_URL = /siteUrl:\s*'([^']+)'/.exec(envSource)[1];

/**
 * Playwright is not a project dependency — it is installed globally as part of
 * `@playwright/cli`. Resolved by path so this script adds nothing to
 * `package.json`, and so it keeps working on a machine that never ran `npm i`.
 *
 * `pathToFileURL` is required because a bare `G:/...` string is read as a URL
 * with the `g:` scheme, which the ESM loader rejects on Windows.
 */
const { pathToFileURL } = await import('node:url');
const { existsSync } = await import('node:fs');

const PLAYWRIGHT_PATH =
  process.env.PLAYWRIGHT_PATH ??
  'G:\\Softwares\\nodejs\\node_modules\\@playwright\\cli\\node_modules\\playwright\\index.mjs';

if (!existsSync(PLAYWRIGHT_PATH)) {
  console.error(`Playwright not found at ${PLAYWRIGHT_PATH}`);
  console.error('Set PLAYWRIGHT_PATH to its index.mjs, or run: npm i -D playwright');
  process.exit(1);
}

const { chromium } = await import(pathToFileURL(PLAYWRIGHT_PATH).href);

/**
 * Uses the browser already installed on the machine rather than Playwright's
 * bundled build, which is not downloaded here and would mean a ~150 MB download
 * just to read some meta tags.
 */
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(
  existsSync(CHROME_PATH) ? { executablePath: CHROME_PATH } : { channel: 'chrome' },
);
const page = await browser.newPage();

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ''}`);
    failures += 1;
  }
}

/**
 * `networkidle` is never reached in this app: Firestore subscribes over a
 * long-lived connection that stays open, so the network is permanently busy.
 * Instead each page is given a selector that only appears once its data has
 * loaded, so the audit never measures a half-rendered page — which is what
 * produced a misleading "canonical: /" on the restaurant route.
 */
async function visit(url, readySelector) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 45_000 });
  }
  // One frame for the SeoTitleStrategy and the component effects to run after
  // the router settles and Firestore emits.
  await page.waitForTimeout(600);
}
  function meta(selector) {
  return page.locator(selector).first().getAttribute('content').catch(() => null);
}

/** Selector that proves the page's own data has rendered, not just the shell. */
const READY = {
  '/': '.dish, app-restaurant-card',
  '/restaurants': 'app-restaurant-card',
  '/restaurant/zaika-house': '.row__name',
};

for (const [label, path] of [
  ['home', '/'],
  ['restaurants', '/restaurants'],
  ['restaurant detail', '/restaurant/zaika-house'],
]) {
  console.log(`\n=== ${label} (${path}) ===`);
  await visit(`${BASE}${path}`, READY[path]);

  const title = await page.title();
  const description = await meta('meta[name="description"]');
  const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href');
  const robots = await meta('meta[name="robots"]');
  const ogTitle = await meta('meta[property="og:title"]');
  const ogImage = await meta('meta[property="og:image"]');
  const ogUrl = await meta('meta[property="og:url"]');
  const jsonLdTypes = await page.evaluate(() =>
    [...document.querySelectorAll('script[data-seo="jsonld"]')].map(
      (s) => JSON.parse(s.textContent)['@type'],
    ),
  );

  console.log(`  title      : ${title}`);
  console.log(`  canonical  : ${canonical}`);
  console.log(`  robots     : ${robots}`);
  console.log(`  og:image   : ${ogImage}`);
  console.log(`  JSON-LD    : ${jsonLdTypes.join(', ') || '(none)'}`);

  check('title is set and names the brand', title.length > 10 && title.includes('ZaikaHub'));
  check(
    'description present and snippet-length',
    Boolean(description) && description.length >= 70 && description.length <= 185,
    `${description?.length ?? 0} chars`,
  );
  check('canonical is absolute', Boolean(canonical?.startsWith('https://')));
  check('open graph title set', Boolean(ogTitle));
  check('og:image is an absolute https URL', Boolean(ogImage?.startsWith('https://')));
  check('og:url matches the page', Boolean(ogUrl?.startsWith(SITE_URL)));

  // Only one canonical may exist, or a crawler has to guess which URL is real.
  const canonicalCount = await page.locator('link[rel="canonical"]').count();
  check('exactly one canonical link', canonicalCount === 1, `found ${canonicalCount}`);

  if (path === '/restaurant/zaika-house') {
    check('restaurant schema present', jsonLdTypes.includes('Restaurant'));
    check('breadcrumb schema present', jsonLdTypes.includes('BreadcrumbList'));

    const schema = await page.evaluate(() => {
      const node = [...document.querySelectorAll('script[data-seo="jsonld"]')].find(
        (s) => JSON.parse(s.textContent)['@type'] === 'Restaurant',
      );
      return node ? JSON.parse(node.textContent) : null;
    });
    check('schema carries a rating', typeof schema?.aggregateRating?.ratingValue === 'string');
    check('schema carries menu sections', Array.isArray(schema?.hasMenuSection));
  } else {
    check('page is indexable', Boolean(robots?.includes('index')));
  }
}

// Pre-login content: the whole point of the first-visit experience.
console.log('\n=== pre-login content ===');
await visit(`${BASE}/`, '.dish, app-restaurant-card');

const dishTiles = await page.locator('.dish').count();
const dishNames = await page.locator('.dish__name').allTextContents();
const brokenImages = await page.evaluate(() =>
  [...document.images].filter((img) => img.complete && img.naturalWidth === 0).length,
);
const creditLines = await page.locator('app-image-credit .credit').count();

console.log(`  dish tiles    : ${dishTiles}`);
console.log(`  broken images : ${brokenImages}`);
console.log(`  credit lines  : ${creditLines}`);

check('popular dishes are shown before login', dishTiles >= 6, `${dishTiles} tiles`);
check('dish tiles show real names', dishNames.filter((n) => n.trim().length > 2).length === dishTiles);
check('no broken images on the home page', brokenImages === 0);
check('CC BY photos are credited', creditLines > 0, `${creditLines} credit lines`);

// Private screens must not be indexable.
//
// Each of these is behind `authGuard`, so an anonymous visit is redirected to
// /login. Waiting on the login form is what makes the check meaningful: reading
// the robots tag before the redirect settles reports whatever the *previous*
// page left in the document, which is how this check first "failed" against
// correct behaviour.
console.log('\n=== private routes ===');
for (const path of ['/cart', '/orders', '/owner', '/checkout']) {
  await visit(`${BASE}${path}`, 'form input[type="password"], form input[type="email"]');
  const robots = await meta('meta[name="robots"]');
  const landed = new URL(page.url()).pathname;
  check(`${path} is noindex`, robots === 'noindex, nofollow', `${robots} (landed on ${landed})`);
}

await browser.close();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);