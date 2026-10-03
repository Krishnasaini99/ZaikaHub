/**
 * Downloads food photographs from Wikimedia Commons under a licence that is safe
 * to publish commercially.
 *
 * WHY WIKIMEDIA COMMONS
 * ---------------------
 * Two reasons, and the second one decided it.
 *
 * 1. It is a canonical library of freely-licensed media where the licence is a
 *    first-class field on the file itself, not something inferred from a search
 *    result page. Scraping image search results instead is how projects end up
 *    shipping artwork they have no right to use.
 *
 * 2. It has no anonymous rate limit. Openverse's unauthenticated quota is small
 *    enough that a 25-image run exhausted it twice while developing this script,
 *    which made it unusable as a repeatable tool.
 *
 * LICENCE POLICY
 * --------------
 * Accepted:
 *   - CC0 / Public domain / PDM — no obligation.
 *   - CC BY (2.0, 3.0, 4.0) — attribution required, written automatically into
 *     `credits.json` and `CREDITS.md`.
 *
 * Rejected:
 *   - CC BY-SA — Share-Alike can propagate into the whole application. Not a
 *     risk worth taking for a dish photo.
 *   - NC (non-commercial) and ND (no derivatives) — incompatible with a
 *     commercial product and with the cropping/resizing this app does.
 *
 * `fallbackTo` names another id already in this list. When Commons cannot be
 * reached at all — its API resets connections once a machine has made a few
 * hundred requests — the item reuses that image instead of leaving a hole in the
 * set. The credit is carried over from the source entry, so provenance is never
 * lost by taking the shortcut.
 *
 * Run: node tools/fetch-food-images.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://commons.wikimedia.org/w/api.php';
const OUT_DIR = 'tools/food-images';
const CACHE_FILE = `${OUT_DIR}/search-cache.json`;
const USER_AGENT = 'ZaikaHub/1.0 (food delivery demo; contact zaikahub@example.com)';

/** Licence identifiers we are willing to ship. */
const ALLOWED_LICENCE_CODES = new Set([
  'cc0',
  'pdm',
  'public domain',
  'cc-by-2.0',
  'cc-by-3.0',
  'cc-by-4.0',
  'cc-by-2.5',
  'cc-by-1.0',
]);

/** Matches the canonical `LicenseShortName`, e.g. "CC BY-SA 4.0". */
const ALLOWED_SHORT_NAMES = /^(cc0|pd|public domain|cc by[ -]?\d)/i;

/**
 * Titles that mean the file is not usable food photography.
 *
 * This list exists because relevance alone is not enough. Two real examples from
 * a previous run:
 *
 *   - "Plate 8. Our Colonel's Wife, 'Curry and Rice' (complete)" matched the
 *     term "curry" and turned out to be a 19th-century lithograph.
 *   - "NCI Visuals Food Hamburger" is a clinical photograph on a black
 *     background with the sample tray still in shot.
 *
 * Both were correctly licensed and both were utterly wrong for a food card.
 * Commons holds a lot of archival and medical material, and much of it is in the
 * public domain, so a licence filter actively steers toward it.
 */
const REJECT_TITLE = new RegExp(
  [
    'lithograph', 'engraving', 'etching', 'illustration', 'drawing', 'sketch',
    'woodcut', '\\bplate \\d', 'visuals', 'poster', 'advert', 'advertisement',
    'logo', 'clipart', 'icon', 'symbol', 'diagram', 'chart', 'graph',
    'manuscript', 'codex', 'folio', '\\bpage \\d', 'title page',
    'map of', '\\bmap\\b', 'stamp', 'coin', 'banknote',
    '18th century', '19th century', 'century',
    'specimen', 'herbarium', 'botanical', 'anatomy',
    'menu card', 'trade card', 'matchbook',
  ].join('|'),
  'i',
);

/**
 * A file is only considered if it does not look like archival or non-photographic
 * material. The image's own categories are not consulted — the title is what
 * actually carried the misleading terms in both failures above.
 */
function looksLikeUsablePhoto(title) {
  return !REJECT_TITLE.test(title);
}

/**
 * Items to fetch.
 *
 * `mustMatch` is a relevance guard. Without it the fetcher will happily return
 * whatever the search ranked first: asking for "chocolate brownie" once returned
 * a plate of orecchiette, and "chilli garlic sauce" returned an Italian pork
 * spread. A wrong-but-licensed photo is worse than no photo at all, because the
 * dish name is printed next to it. Any one of these words appearing in the
 * Commons file title is enough.
 *
 * `query` holds several phrasings, tried in order, so a narrow term with no
 * licensed match does not leave a hole.
 */
const WANTED = [
  // --- restaurant covers ---
  // A cover has to read as "this kind of place", not merely mention the right
// country. An earlier pass matched "Vegetarian Samosas at an Indian restaurant
// in Vancouver" for the biryani house, which made it look like a samosa shop.
// The biryani house's cover reuses the showcase biryani photo. Commons resets
// connections after a few hundred requests from one machine, and a biryani plate
// is an honest stand-in for it anyway — better than the samosa photo this slot
// held before, which made the restaurant look like a snack bar.
{ id: 'cover-zaika-house', query: ['biryani', 'indian curry dish', 'thali indian', 'indian food plate'], mustMatch: ['biryani', 'curry', 'thali', 'paneer', 'tikka', 'dosa'], fallbackTo: 'showcase-biryani' },
  { id: 'cover-bombay-pizza', query: ['pizzeria pizza restaurant', 'pizza restaurant'], mustMatch: ['pizza'] },
  { id: 'cover-wok-this-way', query: ['chinese food dishes', 'chinese cuisine table'], mustMatch: ['chinese', 'noodle', 'wok', 'stir fry'] },
  { id: 'cover-mithai-corner', query: ['indian sweets mithai', 'indian dessert sweets plate'], mustMatch: ['sweet', 'mithai', 'dessert', 'barfi', 'laddu'] },

  // --- Zaika House ---
  { id: 'dish-hyderabadi-biryani', query: ['hyderabadi biryani', 'biryani rice dish'], mustMatch: ['biryani'] },
  { id: 'dish-paneer-tikka-masala', query: ['paneer tikka masala', 'shahi paneer curry'], mustMatch: ['paneer'] },
  { id: 'dish-veg-dum-biryani', query: ['vegetable biryani', 'veg biryani'], mustMatch: ['biryani'] },
  { id: 'dish-butter-naan', query: ['butter naan', 'naan bread tandoor'], mustMatch: ['naan'] },
  { id: 'dish-gulab-jamun', query: ['gulab jamun', 'jamun sweet'], mustMatch: ['jamun'] },

  // --- Bombay Pizza Co. ---
  { id: 'dish-margherita-pizza', query: ['margherita pizza', 'pizza margherita'], mustMatch: ['pizza'] },
  { id: 'dish-tandoori-paneer-pizza', query: ['pizza paneer tikka', 'paneer pizza', 'vegetarian pizza'], mustMatch: ['pizza'] },
  { id: 'dish-chicken-tikka-pizza', query: ['chicken tikka pizza', 'chicken pizza'], mustMatch: ['pizza'] },
  { id: 'dish-garlic-breadsticks', query: ['garlic breadsticks', 'garlic bread'], mustMatch: ['garlic', 'bread'] },

  // --- Wok This Way ---
  { id: 'dish-veg-manchurian', query: ['gobi manchurian', 'manchurian chinese dish'], mustMatch: ['manchurian'] },
  { id: 'dish-hakka-noodles', query: ['chinese noodles dish', 'hakka noodles'], mustMatch: ['noodle'] },
  { id: 'dish-chilli-garlic-sauce', query: ['chilli garlic sauce', 'chili garlic dip'], mustMatch: ['chilli', 'chili'] },

  // --- Mithai Corner ---
  { id: 'dish-rasmalai', query: ['rasmalai', 'ras malai sweet'], mustMatch: ['rasmalai', 'ras malai'] },
  { id: 'dish-brownie', query: ['chocolate brownie', 'brownie'], mustMatch: ['brownie'] },
  { id: 'dish-samosa', query: ['samosa', 'samosa indian snack'], mustMatch: ['samosa'] },

  // --- pre-login showcase (food shown before signing in) ---
  { id: 'showcase-biryani', query: ['biryani rice', 'biryani dish', 'biryani'], mustMatch: ['biryani'] },
  { id: 'showcase-pizza', query: ['pizza slice', 'whole pizza'], mustMatch: ['pizza'] },
  { id: 'showcase-dessert', query: ['indian sweets plate', 'mithai sweets'], mustMatch: ['sweet', 'mithai', 'dessert', 'barfi', 'laddu'] },
  { id: 'showcase-chinese', query: ['chinese noodle dish', 'stir fried noodles'], mustMatch: ['noodle', 'chinese'] },
  { id: 'showcase-thali', query: ['indian thali', 'thali platter'], mustMatch: ['thali'] },
  { id: 'showcase-dosa', query: ['masala dosa', 'dosa'], mustMatch: ['dosa'] },

  // --- "Order by cuisine" tiles ---
  // These are shown as small square cards, so the search leans on the *plated
  // dish* rather than the ingredient wherever possible: a card showing a loose
  // pile of raw spices reads as clutter at 160px, and Commons has far more of
  // those than of plated dishes.
  // Biryani had no licensed plated-dish match left after the relevance filter,
  // so it reuses the dish photo already fetched for the menu. Same dish, same
  // credit — a cuisine tile does not need a different photograph.
  { id: 'cuisine-biryani', query: ['biryani dish plate', 'biryani'], mustMatch: ['biryani'], fallbackTo: 'dish-hyderabadi-biryani' },
  { id: 'cuisine-pizza', query: ['pizza margherita', 'pizza whole'], mustMatch: ['pizza'] },
  { id: 'cuisine-burgers', query: ['hamburger burger', 'cheeseburger'], mustMatch: ['burger', 'hamburger'] },
  { id: 'cuisine-desserts', query: ['cake dessert slice', 'dessert plate'], mustMatch: ['cake', 'dessert', 'sweet', 'pudding', 'tart'] },
  { id: 'cuisine-chinese', query: ['chinese food dish', 'dim sum'], mustMatch: ['chinese', 'dim sum', 'dumpling', 'noodle'] },
  { id: 'cuisine-south-indian', query: ['dosa plate', 'south indian food'], mustMatch: ['dosa', 'idli', 'vada', 'uttapam', 'south indian'] },
  { id: 'cuisine-north-indian', query: ['north indian curry', 'butter chicken dish'], mustMatch: ['curry', 'butter chicken', 'tikka', 'paneer', 'north indian'] },
  { id: 'cuisine-street-food', query: ['pani puri street', 'bhel puri', 'chaat dish', 'vada pav'], mustMatch: ['pani puri', 'golgappa', 'bhel', 'chaat', 'vada pav', 'pav bhaji', 'dahi puri', 'sev puri', 'kachori', 'tikki'] },
];

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Commons stores author names as HTML fragments, sometimes with numeric
 * entities. Both have to go, or the credit line renders as mojibake.
 */
function stripHtml(value = '') {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCache() {
  if (!existsSync(CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * True when a file's licence is one we accept.
 *
 * Both identifiers are checked because Commons carries two spellings: the
 * machine code (`cc-by-sa-4.0`) and the human label ("CC BY-SA 4.0"). Matching
 * only one of them is how a Share-Alike file slips through a naive filter.
 */
function isAllowed(meta = {}) {
  const code = (meta.License?.value ?? '').trim().toLowerCase();
  const short = (meta.LicenseShortName?.value ?? '').trim();

  if (code && ALLOWED_LICENCE_CODES.has(code)) {
    return true;
  }
  // The short name is the reliable fallback, but it must be anchored: without
  // the `^`, "CC BY-SA 4.0" would match `cc by`.
  return ALLOWED_SHORT_NAMES.test(short);
}

function needsAttribution(meta = {}) {
  const short = (meta.LicenseShortName?.value ?? '').trim();
  const code = (meta.License?.value ?? '').trim().toLowerCase();
  return !(short.startsWith('cc0') || short.startsWith('pd') || code === 'cc0' || code === 'pdm');
}

/**
 * `fetch` with a short retry.
 *
 * Commons occasionally drops a connection mid-request. Without this, one flaky
 * socket silently costs an image that a second attempt would have fetched
 * perfectly well.
 */
async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Bumped whenever the ranking or filtering rules change.
 *
 * It is part of the cache key on purpose. Without it, a cache written before
 * `REJECT_TITLE` existed would keep serving the 19th-century lithograph and the
 * clinical hamburger indefinitely — the filters live *after* the cache lookup,
 * so a stale entry is never re-examined. This is the only thing that makes a
 * filter change take effect on an existing checkout.
 */
const FILTER_VERSION = 2;

async function search(query, cache, mustMatch = []) {
  // The relevance filter is part of the cache identity: reusing a result that
  // was ranked before `mustMatch` existed would smuggle past the very check the
  // filter exists to enforce.
  const cacheKey = `v${FILTER_VERSION}::${query}::${mustMatch.join('|')}`;

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    // `filetype:bitmap` keeps diagrams, SVGs and videos out of the results.
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '25',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    // Asking the API for a pre-scaled thumb avoids downloading a 4K original
    // that would then be downscaled again by the CDN.
    iiurlwidth: '1200',
  });

  const response = await fetchWithRetry(`${API}?${params}`);

  const data = await response.json();
  const pages = Object.values(data?.query?.pages ?? {});

  const ranked = pages
    .filter((p) => p.imageinfo?.[0])
    .filter((p) => isAllowed(p.imageinfo[0].extmetadata))
    .filter((p) => looksLikeUsablePhoto(p.title))
    .filter((p) => {
      const ii = p.imageinfo[0];
      if ((ii.width ?? 0) < 640 || (ii.height ?? 0) < 420) {
        return false;
      }
      // Browsers do not render TIFF, and Cloudinary would reject it as a broken
      // upload. A `filetype:bitmap` search still returns them.
      if (ii.mime && !/^image\/(jpeg|png|webp)$/.test(ii.mime)) {
        return false;
      }
      return true;
    })
    // Relevance gate: the Commons file title has to actually mention the dish.
    .filter((p) => {
      if (mustMatch.length === 0) {
        return true;
      }
      const title = p.title.toLowerCase();
      return mustMatch.some((term) => title.includes(term.toLowerCase()));
    })
    .map((p) => {
      const ii = p.imageinfo[0];
      const meta = ii.extmetadata;
      const ratio = ii.width / ii.height;
      // Prefer landscape 3:2-ish, which suits both cover banners and cards.
      const shapeScore = ratio >= 1.2 && ratio <= 2.1 ? 2 : ratio > 0.85 ? 1 : 0;
      const sizeScore = Math.min((ii.width * ii.height) / 1_500_000, 2);
      const licence = meta.LicenseShortName?.value ?? meta.License?.value ?? 'unknown';
      // CC0 and CC BY uploads skew towards people actually photographing food.
      // Plain "public domain" on Commons skews towards scanned archives, so the
      // weaker licence signal is treated as a slight downgrade rather than
      // treated as equally good.
      const licenceScore = /^(cc0|cc by)/i.test(licence) ? 1.5 : 0;
      return {
        title: p.title,
        licence,
        licenceUrl: meta.LicenseUrl?.value ?? null,
        creator: stripHtml(meta.Artist?.value) || 'Unknown author',
        descriptionUrl: ii.descriptionurl,
        // `thumburl` is the scaled version when available; fall back to the
        // original for files smaller than the requested width.
        url: (ii.thumburl || ii.url).split('?')[0],
        width: ii.width,
        height: ii.height,
        score: shapeScore * 3 + sizeScore + licenceScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  cache[cacheKey] = ranked;
  return ranked;
}

/**
 * Downloads and verifies the candidate really is an image.
 *
 * Content-type alone is not trusted: a hotlinked URL can return an HTML error
 * page with a 200 status, which would otherwise be uploaded and stored as a
 * broken dish photo.
 */
async function download(candidate, destination) {
  // Wikimedia's CDN sometimes answers 403 to a bare bot-shaped request, so a
  // browser-shaped referer is tried before giving up on a candidate.
  const attempts = [
    { 'User-Agent': USER_AGENT },
    { 'User-Agent': USER_AGENT, Referer: 'https://commons.wikimedia.org/' },
    {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: 'https://commons.wikimedia.org/',
    },
  ];

  let lastError = 'download failed';

  for (const headers of attempts) {
    let response;
    try {
      response = await fetch(candidate.url, { headers });
    } catch (error) {
      lastError = `network error: ${error.message}`;
      continue;
    }

    if (!response.ok) {
      lastError = `download failed: ${response.status}`;
      continue;
    }

    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const extension = EXTENSIONS[type];
    if (!extension) {
      // Usually an HTML error page served with a 200.
      lastError = `unsupported content-type "${type}"`;
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    // A 1200px-wide photo is never under 8 kB; anything that small is a stub.
    if (bytes.length < 8_000) {
      lastError = `suspiciously small (${bytes.length} bytes)`;
      continue;
    }

    const path = `${destination}${extension}`;
    writeFileSync(path, bytes);
    return { path, bytes: bytes.length, contentType: type };
  }

  throw new Error(lastError);
}

async function main() {
  // No wipe on start: a previous run's downloads and their provenance are
  // worth more than a clean slate, especially when a later run hits a network
  // error partway through.
  mkdirSync(OUT_DIR, { recursive: true });

  const cache = loadCache();
  const fresh = [];
  const failed = [];

  // Read up front so a `fallbackTo` item can borrow an image and its credit from
  // an entry already on disk, including one fetched by an earlier run.
  const creditsOnDisk = existsSync(`${OUT_DIR}/credits.json`)
    ? JSON.parse(readFileSync(`${OUT_DIR}/credits.json`, 'utf8'))
    : [];

  for (const item of WANTED) {
    process.stdout.write(`${item.id.padEnd(26)} `);

    let saved = null;
    let used = null;
    let reason = 'no licensed match';

    for (const query of item.query) {
      let candidates = [];
      try {
        candidates = await search(query, cache, item.mustMatch);
      } catch (error) {
        reason = `search failed: ${error.message}`;
        continue;
      }

      for (const candidate of candidates.slice(0, 5)) {
        try {
          saved = await download(candidate, `${OUT_DIR}/${item.id}`);
          used = candidate;
          break;
        } catch (error) {
          reason = error.message;
        }
      }

      if (saved) {
        break;
      }
      await sleep(150);
    }

    if ((!saved || !used) && item.fallbackTo) {
      // Reuse another entry's image rather than leaving a gap. The provenance
      // comes from that entry's credit, so an image borrowed this way is
      // attributed exactly like a freshly fetched one.
      const source = creditsOnDisk.find((c) => c.id === item.fallbackTo);
      if (source && existsSync(source.file)) {
        console.log(`FALLBACK -> ${item.fallbackTo}`);
        fresh.push({ ...source, id: item.id, query: item.query[0] });
        continue;
      }
    }

    if (!saved || !used) {
      failed.push({ id: item.id, reason });
      console.log(`SKIP  ${reason}`);
      continue;
    }

    fresh.push({
      id: item.id,
      query: item.query[0],
      file: saved.path,
      bytes: saved.bytes,
      title: used.title.replace(/^File:/, ''),
      creator: used.creator,
      licence: used.licence,
      licenceUrl: used.licenceUrl,
      sourcePage: used.descriptionUrl,
      needsAttribution: needsAttribution({ LicenseShortName: { value: used.licence } }),
    });

    const tag = used.licence.toUpperCase().slice(0, 18).padEnd(18);
    console.log(`OK  ${tag} ${String(Math.round(saved.bytes / 1024)).padStart(5)}kB`);
    await sleep(120);
  }

  // Merge with what is already on disk so attribution from earlier runs
  // survives a partial re-run.
  const previous = existsSync(`${OUT_DIR}/credits.json`)
    ? JSON.parse(readFileSync(`${OUT_DIR}/credits.json`, 'utf8'))
    : [];

  // An entry carried over from an earlier run is only trusted if it still
  // satisfies the dish's relevance rule. Before `mustMatch` existed, the
  // brownie slot held a photo of orecchiette; keeping it would make the merge
  // a way to preserve exactly the mistakes this script now prevents.
  const stillRelevant = (entry) => {
    const item = WANTED.find((w) => w.id === entry.id);
    if (!item || !item.mustMatch || item.mustMatch.length === 0) {
      return true;
    }
    const title = entry.title ?? '';
    // The archival filter must be re-applied here too, or an entry fetched
    // before that filter existed gets carried over forever.
    if (!looksLikeUsablePhoto(title)) {
      return false;
    }
    const lower = title.toLowerCase();
    return item.mustMatch.some((term) => lower.includes(term.toLowerCase()));
  };

  const all = [...fresh];
  for (const old of previous) {
    if (all.some((c) => c.id === old.id)) {
      continue;
    }
    if (existsSync(old.file) && stillRelevant(old)) {
      all.push(old);
    } else {
      console.log(`dropped stale entry: ${old.id} (${old.title})`);
    }
  }

  writeFileSync(`${OUT_DIR}/credits.json`, JSON.stringify(all, null, 2));
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  const attribution = all.filter((c) => c.needsAttribution);
  const licenceCounts = all.reduce(
    (acc, c) => ({ ...acc, [c.licence]: (acc[c.licence] ?? 0) + 1 }),
    {},
  );

  writeFileSync(
    `${OUT_DIR}/CREDITS.md`,
    [
      '# Image credits',
      '',
      'Generated by `tools/fetch-food-images.mjs`. Do not edit by hand.',
      '',
      `**${all.length} images** from [Wikimedia Commons](https://commons.wikimedia.org).`,
      '',
      'Only CC0, Public Domain and CC BY images are used. CC BY-SA, non-commercial',
      '(NC) and no-derivatives (ND) licences are rejected by the fetcher.',
      '',
      '## Licences used',
      '',
      ...Object.entries(licenceCounts).map(([licence, count]) => `- ${licence}: ${count}`),
      '',
      '## Attribution',
      '',
      attribution.length === 0
        ? '_Every image is CC0 or Public Domain — no attribution required._'
        : attribution
            .map(
              (c) =>
                `- **${c.title}** by ${c.creator} — ` +
                `[${c.licence}](${c.licenceUrl}) · [source](${c.sourcePage})`,
            )
            .join('\n'),
      '',
      '## Full detail',
      '',
      '`credits.json` holds the same list with byte sizes and file paths.',
      '',
    ].join('\n'),
  );

  console.log(`\n${all.length}/${WANTED.length} images available, ${WANTED.length - all.length} missing`);
  console.log(`attribution required for ${attribution.length}`);
  if (failed.length > 0) {
    console.log('failed this run:');
    for (const f of failed) {
      console.log(`  ${f.id}: ${f.reason}`);
    }
  }
}

main().catch((error) => {
  console.error('fatal:', error);
  process.exit(1);
});