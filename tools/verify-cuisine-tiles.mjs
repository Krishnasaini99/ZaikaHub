/**
 * Verifies the "Order by cuisine" photo tiles on the home page.
 *
 * Run: node tools/verify-cuisine-tiles.mjs http://localhost:4200
 *
 * What this actually protects:
 *
 *  1. That every tile still resolves its photograph. The URLs are hardcoded in
 *     `HomeComponent` and point at Cloudinary; nothing in the build or the test
 *     suite notices if one rots, and a broken tile renders as a browser's
 *     broken-image glyph in the middle of the landing page.
 *  2. That the label stays readable. The text is white and sits on a gradient
 *     scrim over an unknown photograph — the pizza and the dosa are close to
 *     white — so the check does not sample one lucky pixel. It takes the
 *     scrim's own alpha at the label's position and composites it over *pure
 *     white*, which is the worst photograph that could ever be behind it. If
 *     that worst case clears WCAG AA, every real photo does.
 *  3. That the CC BY attribution is on the page for each tile. Six of the eight
 *     are CC BY, where visible credit is a licence condition.
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PW =
  process.env.PLAYWRIGHT_PATH ??
  'G:\\Softwares\\nodejs\\node_modules\\@playwright\\cli\\node_modules\\playwright\\index.mjs';
const CHROME_PATH =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!existsSync(PW)) {
  console.error(`Playwright not found at ${PW}`);
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(PW).href);

const BASE = process.argv[2] ?? 'http://localhost:4200';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

const channel = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ({ r, g, b }) =>
  0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);

/** WCAG contrast between two colours. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const browser = await chromium.launch({ executablePath: CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
// Not `networkidle`: Firestore holds a long-lived connection open, so the page
// never goes idle and the wait times out on a perfectly healthy app.
await page.waitForSelector('.cuisine-cell', { timeout: 45_000 });
// Dismiss the sign-in prompt before anything is captured. Its backdrop is a
// dark scrim painted over the whole page, and without this the screenshot of
// the tiles comes out with an unexplained dark rectangle across it that looks
// exactly like a broken scrim gradient.
await page.evaluate(() => sessionStorage.setItem('zaika-hub.signin-prompt-seen', '1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cuisine-cell', { timeout: 45_000 });
// The tiles are lazy and sit below the fold, so scrolling them into view is
// what actually triggers the downloads. Asking whether they loaded without
// doing this reports eight broken images on a perfectly good page.
await page.locator('.cuisines').scrollIntoViewIfNeeded();
// Give the photographs a beat to arrive before checking, otherwise the check
// races the network and fails on the first run only.
await page.waitForTimeout(4_000);
// Wait for completion rather than for a fixed delay alone, so a slow CDN does
// not turn into a spurious failure. The timeout is swallowed: the check below
// is what reports the result, and it produces a per-image reason instead of a
// single stack trace.
await page
  .waitForFunction(
    () => [...document.querySelectorAll('.cuisine__img')].every((img) => img.complete),
    { timeout: 30_000 },
  )
  .catch(() => {});

console.log('=== structure ===');
const tiles = await page.locator('.cuisine-cell').count();
const links = await page.locator('a.cuisine').count();
const images = await page.locator('.cuisine__img').count();
check('eight cuisine tiles', tiles === 8, `${tiles} tiles`);
check('every tile is a link', links === tiles, `${links} links`);
check('every tile has a photograph', images === tiles, `${images} images`);

console.log('\n=== photographs loaded ===');
const loaded = await page.evaluate(() =>
  [...document.querySelectorAll('.cuisine__img')].map((img) => ({
    alt: img.getAttribute('src')?.split('/').pop() ?? '?',
    ok: img.complete && img.naturalWidth > 0,
    width: img.naturalWidth,
  })),
);
for (const img of loaded) {
  check(`loaded ${img.alt}`, img.ok, img.ok ? `${img.width}px wide` : 'broken or pending');
}

console.log('\n=== labels ===');
const labels = await page.evaluate(() =>
  [...document.querySelectorAll('.cuisine__name')].map((el) => {
    const scrim = el.parentElement.querySelector('.cuisine__scrim');
    return {
      text: el.textContent?.trim() ?? '',
      color: getComputedStyle(el).color,
      gradient: scrim ? getComputedStyle(scrim).backgroundImage : '',
      // Where the label sits, measured from the bottom of the tile. The scrim
      // is a `to top` gradient, so this is how far up the stop we need.
      offsetFromBottom:
        1 -
        (el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - el.parentElement.getBoundingClientRect().top) /
          el.parentElement.getBoundingClientRect().height,
    };
  }),
);

check('all eight labels rendered', labels.length === 8 && labels.every((l) => l.text), `${labels.length} labels`);

// Alpha of the scrim at the label's height, taken from the gradient stops.
function alphaAt(gradient, offsetFromBottom) {
  const stops = [...gradient.matchAll(/rgba?\([^)]+\)\s*([\d.]+)%/g)].map((m) => ({
    alpha: /rgba\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\s*\)/.exec(
      m[0],
    )?.[1],
    pct: Number(m[1]),
  }));
  // Percentages run bottom-to-top for a `to top` gradient, and the offset is
  // already measured from the bottom, so the two scales line up directly.
  const sorted = stops.sort((a, b) => a.pct - b.pct);
  if (sorted.length < 2) {
    return null;
  }
  const below = [...sorted].reverse().find((s) => s.pct <= offsetFromBottom * 100) ?? sorted[0];
  const above = sorted.find((s) => s.pct >= offsetFromBottom * 100) ?? sorted.at(-1);
  if (below.pct === above.pct) {
    return Number(below.alpha);
  }
  const t = (offsetFromBottom * 100 - below.pct) / (above.pct - below.pct);
  return Number(below.alpha) + t * (Number(above.alpha) - Number(below.alpha));
}

const white = { r: 255, g: 255, b: 255 };
let worst = Infinity;
let worstLabel = '';
for (const label of labels) {
  const alpha = alphaAt(label.gradient, label.offsetFromBottom);
  if (alpha === null) {
    check(`scrim parsed for "${label.text}"`, false, 'gradient not understood');
    continue;
  }
  // Worst case: the photo underneath is pure white, so the scrim is doing all
  // the darkening it possibly can and nothing is helping from below.
  const composited = {
    r: alpha * 6 + (1 - alpha) * 255,
    g: alpha * 6 + (1 - alpha) * 255,
    b: alpha * 8 + (1 - alpha) * 255,
  };
  const ratio = contrast(white, composited);
  if (ratio < worst) {
    worst = ratio;
    worstLabel = label.text;
  }
}
check(
  'label readable even over a pure-white photo',
  worst >= 4.5,
  `worst case ${worst.toFixed(2)}:1 at "${worstLabel}" (WCAG AA needs 4.5:1)`,
);

console.log('\n=== attribution ===');
const credits = await page.locator('.cuisine-cell app-image-credit .credit').count();
check('credit line under every tile', credits === tiles, `${credits} credits`);

const shotPath = '.playwright-cli/cuisine-tiles.png';
await page.locator('.cuisines').first().screenshot({ path: shotPath });
console.log(`\n  screenshot: ${shotPath}`);

await browser.close();

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
