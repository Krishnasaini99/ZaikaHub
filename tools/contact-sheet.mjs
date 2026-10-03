// One-off: renders every fetched food image next to its filename and id so the
// on-disk files can be checked against credits.json in a single screenshot.
//
// Reading the images one at a time proved unreliable — the reader shuffled
// results across parallel calls, which made a correct file look wrong. A
// labelled grid cannot shuffle, because each label travels with its image.
//
// Usage:
//   node tools/contact-sheet.mjs                 every image
//   node tools/contact-sheet.mjs cover- dish-pani  only files containing any argument
//
// The filter exists because a 55-image sheet renders each photo too small to
// judge, and the point of the review is whether a picture looks like premium
// food photography rather than a documentary shot. Pass just the ids added in
// the current pass and the cells come out large enough to actually see.
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Playwright is installed globally rather than as a project dependency, so it is
// resolved the same way `verify-hero-loop.mjs` resolves it.
const CHROME_PATH =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PW =
  process.env.PLAYWRIGHT_PATH ??
  'G:\\Softwares\\nodejs\\node_modules\\@playwright\\cli\\node_modules\\playwright\\index.mjs';

if (!existsSync(PW)) {
  console.error(`Playwright not found at ${PW}`);
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(PW).href);

const dir = resolve('tools/food-images');
const needles = process.argv.slice(2).map((n) => n.toLowerCase());
const files = readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .filter((f) => needles.length === 0 || needles.some((n) => f.toLowerCase().includes(n)))
  .sort();

if (files.length === 0) {
  console.error(`no images match ${needles.join(', ')}`);
  process.exit(1);
}

const cells = files
  .map(
    (f) => `<figure>
      <img src="${pathToFileURL(join(dir, f)).href}" />
      <figcaption>${f}</figcaption>
    </figure>`,
  )
  .join('\n');

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 16px; background: #111; color: #eee;
         font: 13px/1.3 system-ui, sans-serif; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  figure { margin: 0; background: #1c1c20; border: 1px solid #333;
           border-radius: 6px; overflow: hidden; }
  img { width: 100%; height: 150px; object-fit: cover; display: block; }
  figcaption { padding: 5px 6px; font-weight: 600; font-size: 11px;
               letter-spacing: .02em; }
</style><main>${cells}</main>`;

const outDir = resolve('.playwright-cli');
mkdirSync(outDir, { recursive: true });
const sheetPath = join(outDir, 'contact-sheet.html');
writeFileSync(sheetPath, html);

const browser = await chromium.launch({ executablePath: CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
await page.goto(pathToFileURL(sheetPath).href);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
// JPEG rather than PNG: the reader drops images above a few hundred kB, and a
// labelled grid of 32 photos comes out at 3.7 MB as PNG.
await page.screenshot({ path: join(outDir, 'contact-sheet.jpg'), type: 'jpeg', quality: 72, fullPage: true });
await browser.close();

console.log(`${files.length} images -> .playwright-cli/contact-sheet.jpg`);
