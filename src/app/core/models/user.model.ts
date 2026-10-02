/** Roles a ZaikaHub account can hold. Stored on the Firestore user profile. */
export type UserRole = 'customer' | 'owner' | 'admin';

/**
 * Firestore shape of `users/{uid}`.
 * Authoritative source of truth for role — never trust custom claims from the
 * client UI, they are only a display hint.
 */
export interface UserProfile {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly phone: string;
  readonly photoURL: string | null;
  readonly role: UserRole;
  /** UIDs of restaurants this user owns (empty for customers/admins). */
  readonly restaurantIds: readonly string[];
  readonly defaultAddressId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Public projection of a user — safe to send to other clients. */
export interface PublicUser {
  readonly uid: string;
  readonly displayName: string;
  readonly photoURL: string | null;
}
