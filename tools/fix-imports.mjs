// One-off codemod: rewrites relative imports to correct, shortest paths.
// If a specifier no longer resolves, it retries by re-anchoring the tail onto
// each top-level folder under src/app (core, shared, layout, features).
// Run with: node tools/fix-imports.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SRC = resolve('src');
const EXTS = ['.ts', '.html', '.scss'];
const APP = join(SRC, 'app');

/** Top-level folders an import tail may have been anchored to. */
const ANCHORS = readdirSync(APP)
  .filter((entry) => statSync(join(APP, entry)).isDirectory())
  .map((entry) => entry)
  .concat('app');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (EXTS.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Does this path point at a real source file? */
function resolves(base) {
  return (
    isFile(base) ||
    EXTS.some((ext) => isFile(base + ext)) ||
    EXTS.some((ext) => isFile(join(base, 'index' + ext)))
  );
}

function toSpecifier(fromFile, target) {
  let rel = relative(dirname(fromFile), target).split(sep).join('/');
  // TypeScript `moduleResolution: bundler` forbids explicit `.ts` extensions.
  rel = rel.replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Finds a real file for `spec` as written, or by re-anchoring its tail. */
function resolveSpecifier(fromFile, spec) {
  const asWritten = resolve(dirname(fromFile), spec);
  if (resolves(asWritten)) {
    return asWritten;
  }

  // Drop the leading `../` segments and try each anchor folder in turn.
  const tail = spec.replace(/^(\.\.\/)+/, '');
  for (const anchor of ANCHORS) {
    const candidate = resolve(APP, anchor, tail);
    if (resolves(candidate)) {
      return candidate;
    }
  }
  return null;
}

let fixed = 0;
const unresolved = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');

  const next = source.replace(/(from\s+|import\s+)(['"])(\.[^'"]+)\2/g, (match, keyword, quote, spec) => {
    const target = resolveSpecifier(file, spec);
    if (!target) {
      unresolved.push(`${relative('.', file)} -> ${spec}`);
      return match;
    }
    const rewritten = toSpecifier(file, target);
    if (rewritten === spec) {
      return match;
    }
    fixed += 1;
    return `${keyword}${quote}${rewritten}${quote}`;
  });

  if (next !== source) {
    writeFileSync(file, next, 'utf8');
  }
}

for (const item of unresolved) {
  console.warn(`UNRESOLVED  ${item}`);
}
console.log(`\nrewritten: ${fixed}, unresolved: ${unresolved.length}`);
