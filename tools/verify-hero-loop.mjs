/**
 * Verifies the home-page banner actually rotates and loops in a real browser.
 *
 * Unit tests cover the index maths; this covers the parts they cannot: that the
 * interval is really running, that the loop wraps back to the first slide rather
 * than stopping, and that the visible slide and the dots agree.
 *
 * Run: node tools/verify-hero-loop.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME_PATH = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PW =
  process.env.PLAYWRIGHT_PATH ??
  'G:\\Softwares\\nodejs\\node_modules\\@playwright\\cli\\node_modules\\playwright\\index.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4210';

if (!existsSync(PW)) {
  console.error(`Playwright not found at ${PW}`);
  process.exit(1);
}

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

/** Which slide is currently visible, according to the rendered class. */
const visibleName = () =>
  page.evaluate(() => {
    const visible = document.querySelector('.slide--visible');
    return visible?.querySelector('.slide__name')?.textContent?.trim() ?? null;
  });

const activeDot = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dots__dot')].findIndex((dot) =>
      dot.classList.contains('dots__dot--active'),
    ),
  );

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
// The sign-in prompt sits above the banner and would intercept nothing, but it
// obscures the screenshot, so dismiss it the same way the app does.
await page.evaluate(() => sessionStorage.setItem('zaika-hub.signin-prompt-seen', '1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.slide--visible', { timeout: 45_000 });

console.log('\n=== banner structure ===');
const slides = await page.locator('.slide').count();
const dots = await page.locator('.dots__dot').count();
console.log(`  slides=${slides}  dots=${dots}`);

check('at least two dishes to rotate between', slides >= 2, `${slides} slides`);
check('every slide has a dot', dots === slides);
check('exactly one slide is visible at a time', (await page.locator('.slide--visible').count()) === 1);

/**
 * Reads whatever theme is in effect right now.
 *
 * The app defaults to `system`, so the dark palette comes from a
 * `prefers-color-scheme` block rather than from a `data-theme` attribute —
 * which means a theme check has to *choose* the OS preference, or it is really
 * just asserting whatever this machine is set to. `dataTheme` is reported too
 * so a failure can be told apart from "the test forgot to pick a theme".
 */
const readPalette = () =>
  page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    header: getComputedStyle(document.querySelector('header')).backgroundColor,
    text: getComputedStyle(document.body).color,
    dataTheme: document.documentElement.getAttribute('data-theme'),
  }));

// Relative luminance, so "dark" is a measurement rather than an impression.
function luminance(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Asserts the given theme is actually rendered and that its body text clears
 * AA against the background it ends up on.
 *
 * Both themes run this because "everything must be readable on a white screen
 * and a dark one" is a requirement here, not an aspiration — and the failure
 * that prompted it (black chip text on a near-black card) was specific to one
 * of them, so a check covering only the other would not have caught it.
 */
async function checkTheme(name, wantDark) {
  await page.emulateMedia({ colorScheme: wantDark ? 'dark' : 'light' });
  await page.waitForTimeout(300);

  const palette = await readPalette();
  console.log(`\n=== ${name} ===`);
  console.log(`  body bg   : ${palette.body}`);
  console.log(`  header bg : ${palette.header}`);
  console.log(`  text      : ${palette.text}`);
  console.log(`  data-theme: ${palette.dataTheme ?? '(none — following the OS)'}`);

  const bodyLuminance = luminance(palette.body);
  const textLuminance = luminance(palette.text);
  const ratio =
    (Math.max(textLuminance, bodyLuminance) + 0.05) /
    (Math.min(textLuminance, bodyLuminance) + 0.05);
  console.log(`  contrast  : ${ratio.toFixed(2)}:1`);

  check(
    `${name}: page background is ${wantDark ? 'dark' : 'light'}`,
    wantDark ? bodyLuminance < 0.05 : bodyLuminance > 0.5,
    `luminance ${bodyLuminance.toFixed(4)}`,
  );
  check(`${name}: no forced attribute`, palette.dataTheme === null, `data-theme=${palette.dataTheme}`);
  check(`${name}: body text meets WCAG AA`, ratio >= 4.5, `${ratio.toFixed(2)}:1`);
}

await checkTheme('dark theme', true);
await checkTheme('light theme', false);
// Leave the page in dark for the screenshot the rest of this run produces.
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);

console.log('\n=== rotation and loop ===');
const first = await visibleName();
console.log(`  start     : ${first}`);

// One rotation step is whatever the component says it is, so read it out of the
// source instead of repeating a number here. A copy of this constant goes stale
// the first time someone tunes the banner, and a stale delay makes this script
// report a false failure: sampling too early sees the same dish twice.
const ROTATE_MS = (() => {
  const file = readFileSync('src/app/shared/components/hero-showcase.component.ts', 'utf8');
  const match = /const ROTATE_MS = ([\d_]+)/.exec(file);
  if (!match) {
    throw new Error('ROTATE_MS not found in hero-showcase.component.ts');
  }
  return Number(match[1].replace(/_/g, ''));
})();
console.log(`  ROTATE_MS : ${(ROTATE_MS / 1000).toFixed(1)}s (read from the component)`);

await page.waitForTimeout(ROTATE_MS + 1_000);
const second = await visibleName();
console.log(`  after ${(ROTATE_MS + 1000) / 1000}s  : ${second}`);
check('the banner advances on its own', first !== second);

// Keep watching until it comes back to where it started, which is what "loop"
// means. The deadline is derived from the number of slides actually on screen,
// so adding a dish does not quietly push a full cycle past the timeout.
const deadline = Date.now() + slides * ROTATE_MS + 20_000;
let looped = false;
let ticks = 0;
while (Date.now() < deadline) {
  await page.waitForTimeout(2000);
  ticks += 1;
  if ((await visibleName()) === first) {
    looped = true;
    break;
  }
}
check('the banner wraps back to the first slide', looped, `after ${ticks} samples`);

console.log('\n=== dots stay in sync ===');
const dotIndex = await activeDot();
const visibleIndex = await page.evaluate(
  () =>
    [...document.querySelectorAll('.slide')].findIndex((slide) =>
      slide.classList.contains('slide--visible'),
    ),
);
check('the active dot matches the visible slide', dotIndex === visibleIndex, `dot ${dotIndex}, slide ${visibleIndex}`);

await page.screenshot({ path: '.playwright-cli/hero-loop.png', fullPage: false });
console.log('\n  screenshot: .playwright-cli/hero-loop.png');

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);