import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { Address } from '../models/address.model';
import { toDate } from '../utils/date.util';

export interface AddressInput {
  readonly label: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly pincode: string;
  readonly isDefault?: boolean;
}

/**
 * Saved delivery addresses, stored under `users/{uid}/addresses/{addressId}`.
 *
 * The subcollection means loading a user's addresses never scans anyone else's
 * documents — which is also what lets the security rule stay a one-liner
 * (`request.auth.uid == userId`).
 */
@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly firestore = inject(Firestore);

  private addressesRef(userId: string) {
    return collection(this.firestore, `users/${userId}/addresses`);
  }

  private addressDoc(userId: string, addressId: string) {
    return doc(this.firestore, `users/${userId}/addresses/${addressId}`);
  }

  /** Live address list, default address first. */
  listForUser(userId: string): Observable<readonly Address[]> {
    return collectionData(this.addressesRef(userId), { idField: 'id' }).pipe(
      map((docs) =>
        docs
          .map((data) => normaliseAddress(data, userId))
          .sort(
            (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.label.localeCompare(b.label),
          ),
      ),
    );
  }

  async add(userId: string, input: AddressInput): Promise<string> {
    // The first address a user saves is implicitly their default.
    const isFirst = (await this.listForUserOnce(userId)).length === 0;
    const shouldBeDefault = input.isDefault ?? isFirst;

    const ref = await addDoc(this.addressesRef(userId), {
      userId,
      label: input.label,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      pincode: input.pincode,
      isDefault: shouldBeDefault,
      createdAt: serverTimestamp(),
    });

    // A brand-new user has nothing to unset, so skip the extra batch write.
    if (shouldBeDefault && !isFirst) {
      await this.makeDefault(userId, ref.id);
    }
    return ref.id;
  }

  async update(userId: string, addressId: string, input: AddressInput): Promise<void> {
    await updateDoc(this.addressDoc(userId, addressId), {
      ...input,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await deleteDoc(this.addressDoc(userId, addressId));
  }

  /**
   * Promotes one address to default using a batch, so the "exactly one default"
   * invariant holds without a window where two addresses are both default.
   */
  async makeDefault(userId: string, addressId: string): Promise<void> {
    const all = await this.listForUserOnce(userId);
    const batch = writeBatch(this.firestore);
    for (const address of all) {
      batch.update(this.addressDoc(userId, address.id), {
        isDefault: address.id === addressId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  private async listForUserOnce(userId: string): Promise<Address[]> {
    const snapshot = await getDocs(query(this.addressesRef(userId)));
    return snapshot.docs.map((doc) => normaliseAddress(doc.data(), userId));
  }
}

function normaliseAddress(data: DocumentData, userId: string): Address {
  return {
    id: asString(data['id']),
    userId: asString(data['userId'], userId),
    label: asString(data['label'], 'Home'),
    contactName: asString(data['contactName']),
    contactPhone: asString(data['contactPhone']),
    line1: asString(data['line1']),
    line2: asString(data['line2']),
    city: asString(data['city']),
    pincode: asString(data['pincode']),
    isDefault: data['isDefault'] === true,
    createdAt: toDate(data['createdAt']),
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
