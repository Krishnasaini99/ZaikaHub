/**
 * Generates the PWA icons that `manifest.webmanifest` and `index.html`
 * reference. Run with: node tools/make-icons.mjs
 *
 * Everything is rasterised by hand because Node has no canvas and the only
 * alternative is shipping a native image dependency just to draw three
 * rectangles. The "Z" is three thick line segments, which is all a letterform
 * needs at this size.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng, hexToRgb } from './png.mjs';

const BRAND = hexToRgb('#e23744');

/** Distance from point p to segment ab, used to stroke thick lines. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * @param size    square edge in pixels
 * @param padding inset as a fraction of the edge, for the maskable safe zone
 */
function brandIcon(size, padding = 0) {
  const inset = size * padding;
  const box = size - inset * 2;
  const radius = box * 0.22;

  // "Z" geometry, expressed inside the inner box.
  const left = inset + box * 0.3;
  const right = inset + box * 0.7;
  const top = inset + box * 0.28;
  const bottom = inset + box * 0.72;
  const stroke = box * 0.085;

  return encodePng(size, size, (x, y) => {
    const cx = Math.min(Math.max(x, inset + radius), inset + box - radius);
    const cy = Math.min(Math.max(y, inset + radius), inset + box - radius);
    const insideRounded =
      x >= inset && x <= inset + box && y >= inset && y <= inset + box
      && Math.hypot(x - cx, y - cy) <= radius;

    if (!insideRounded) {
      return [0, 0, 0, 0];
    }

    const onTopBar = distanceToSegment(x, y, left, top, right, top) <= stroke;
    const onDiagonal = distanceToSegment(x, y, right, top, left, bottom) <= stroke;
    const onBottomBar = distanceToSegment(x, y, left, bottom, right, bottom) <= stroke;

    if (onTopBar || onDiagonal || onBottomBar) {
      return [255, 255, 255, 255];
    }
    return [BRAND[0], BRAND[1], BRAND[2], 255];
  });
}

mkdirSync('public', { recursive: true });

const targets = [
  ['public/apple-touch-icon.png', 180, 0],
  // Maskable icons are cropped to a circle by some launchers, so the mark needs
  // breathing room inside the safe zone.
  ['public/icon-192.png', 192, 0.12],
  ['public/icon-512.png', 512, 0.12],
];

for (const [path, size, padding] of targets) {
  writeFileSync(path, brandIcon(size, padding));
  console.log(`wrote ${path} (${size}x${size})`);
}