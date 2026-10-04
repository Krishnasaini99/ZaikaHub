import { Injectable, inject } from '@angular/core';
import { DocumentData, Firestore, collectionData, collection, deleteDoc, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import type { CuisineTile, SiteContent } from '../models/site-content.model';
import { toDate } from '../utils/date.util';
import { DEFAULT_SITE_CONTENT, mergeSiteContent } from '../utils/site-content.util';

const SITE_CONTENT = 'siteContent';
const CONTENT_DOC = 'main';
const CUISINE_TILES = 'cuisineTiles';

/**
 * The editable site copy and the "Order by cuisine" row.
 *
 * Reads are live (`collectionData`/`docData`), so a change the owner saves in
 * the admin panel appears on the open home page without a reload — the reason
 * to put this in Firestore at all rather than in a build-time constant.
 *
 * `saveContent` is a full-document overwrite rather than a merge: the admin form
 * is the editor of record, and writing every field means a field added later
 * cannot be left behind by an older form. `mergeSiteContent` on the way *out*
 * is what keeps a bad value from ever reaching the page.
 */
@Injectable({ providedIn: 'root' })
export class SiteContentService {
  private readonly firestore = inject(Firestore);

  /** Live site copy; emits defaults until the document exists. */
  watch(): Observable<SiteContent> {
    return docData(doc(this.firestore, `${SITE_CONTENT}/${CONTENT_DOC}`)).pipe(
      map((data) => mergeSiteContent(data)),
      // `docData` emits `undefined` for a missing document, so the initial value
      // and the empty case both resolve through the same default merge.
      map((content) => content ?? DEFAULT_SITE_CONTENT),
    );
  }

  async saveContent(content: SiteContent): Promise<void> {
    const clean = mergeSiteContent(content);
    const { updatedAt: _ignored, ...fields } = clean;
    await setDoc(
      doc(this.firestore, `${SITE_CONTENT}/${CONTENT_DOC}`),
      { ...fields, updatedAt: new Date() },
      { merge: true },
    );
  }

  /** Live cuisine tiles, ordered by the owner's `order` field. */
  watchCuisineTiles(): Observable<readonly CuisineTile[]> {
    return collectionData(collection(this.firestore, CUISINE_TILES), { idField: 'id' }).pipe(
      map((docs) =>
        docs
          .map((data) => normaliseTile(data, data['id'] as string))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  async saveCuisineTile(tile: CuisineTile): Promise<void> {
    await setDoc(
      doc(this.firestore, `${CUISINE_TILES}/${tile.id}`),
      {
        name: tile.name.trim() || 'Cuisine',
        emoji: tile.emoji.trim(),
        imageUrl: tile.imageUrl,
        imageCredit: tile.imageCredit,
        filter: (tile.filter || tile.name).trim(),
        order: tile.order,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }

  async deleteCuisineTile(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${CUISINE_TILES}/${id}`));
  }
}

/** Defensive projection: a half-written tile renders instead of throwing. */
export function normaliseTile(data: DocumentData, id: string): CuisineTile {
  const str = (key: string, fallback = ''): string =>
    typeof data[key] === 'string' && data[key] ? (data[key] as string) : fallback;
  const num = (key: string, fallback: number): number =>
    typeof data[key] === 'number' && Number.isFinite(data[key]) ? (data[key] as number) : fallback;

  return {
    id,
    name: str('name', 'Cuisine'),
    emoji: str('emoji', '🍽️'),
    imageUrl: typeof data['imageUrl'] === 'string' && data['imageUrl'] ? data['imageUrl'] : null,
    imageCredit:
      typeof data['imageCredit'] === 'string' && data['imageCredit'] ? data['imageCredit'] : null,
    filter: str('filter', str('name', 'Cuisine')),
    order: num('order', 0),
    updatedAt: toDate(data['updatedAt']),
  };
}