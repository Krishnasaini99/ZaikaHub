import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { UserProfile, UserRole } from '../models/user.model';
import { toDate } from '../utils/date.util';

const USERS_COLLECTION = 'users';

export interface CreateProfileInput {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly phone: string;
  readonly role?: UserRole;
}

/**
 * CRUD for `users/{uid}` documents.
 *
 * The profile is written immediately after Firebase Auth creates the account,
 * so a signed-in user always has a document for the security rules to read a
 * role from.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  private profileRef(uid: string) {
    return doc(this.firestore, `${USERS_COLLECTION}/${uid}`);
  }

  /** Live profile stream. Emits `null` when the document does not exist. */
  getProfile(uid: string): Observable<UserProfile | null> {
    return docData(this.profileRef(uid), { idField: 'uid' }).pipe(
      map((data) => (data ? normaliseProfile(data, uid) : null)),
    );
  }

  async getProfileOnce(uid: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(this.profileRef(uid));
    return snapshot.exists() ? normaliseProfile(snapshot.data(), uid) : null;
  }

  async createProfile(input: CreateProfileInput): Promise<void> {
    await setDoc(this.profileRef(input.uid), {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      phone: input.phone,
      photoURL: null,
      role: input.role ?? 'customer',
      restaurantIds: [],
      defaultAddressId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Ensures a profile exists for an account created outside this app (e.g.
   * through the Firebase console). Called right after sign-in.
   */
  async ensureProfile(uid: string, fallback: Partial<CreateProfileInput> = {}): Promise<UserProfile> {
    const existing = await this.getProfileOnce(uid);
    if (existing) {
      return existing;
    }
    await this.createProfile({
      uid,
      email: fallback.email ?? '',
      displayName: fallback.displayName ?? 'ZaikaHub user',
      phone: fallback.phone ?? '',
    });
    return (await this.getProfileOnce(uid))!;
  }

  async updateProfileFields(
    uid: string,
    changes: Partial<Omit<UserProfile, 'uid'>>,
  ): Promise<void> {
    await updateDoc(this.profileRef(uid), { ...changes, updatedAt: serverTimestamp() });
  }

  /**
   * Attaches a restaurant to its owner's profile, promoting a customer to
   * `owner` the first time they publish one.
   */
  async linkRestaurant(uid: string, restaurantId: string): Promise<void> {
    const profile = await this.getProfileOnce(uid);
    const ids = profile?.restaurantIds ?? [];
    if (ids.includes(restaurantId)) {
      return;
    }
    await updateDoc(this.profileRef(uid), {
      restaurantIds: [...ids, restaurantId],
      role: profile?.role === 'customer' ? 'owner' : profile?.role,
      updatedAt: serverTimestamp(),
    });
  }

  async unlinkRestaurant(uid: string, restaurantId: string): Promise<void> {
    const profile = await this.getProfileOnce(uid);
    await updateDoc(this.profileRef(uid), {
      restaurantIds: (profile?.restaurantIds ?? []).filter((id) => id !== restaurantId),
      updatedAt: serverTimestamp(),
    });
  }

  async changeRole(uid: string, role: UserRole): Promise<void> {
    await this.updateProfileFields(uid, { role });
  }
}

/** Defensive projection — every field gets a default, never `undefined`. */
function normaliseProfile(data: DocumentData, uid: string): UserProfile {
  return {
    uid,
    email: asString(data['email']),
    displayName: asString(data['displayName']),
    phone: asString(data['phone']),
    photoURL: typeof data['photoURL'] === 'string' ? data['photoURL'] : null,
    role: (data['role'] as UserRole) ?? 'customer',
    restaurantIds: Array.isArray(data['restaurantIds'])
      ? (data['restaurantIds'] as string[])
      : [],
    defaultAddressId:
      typeof data['defaultAddressId'] === 'string' ? data['defaultAddressId'] : null,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
