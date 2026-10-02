import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

import { UserProfile, UserRole } from '../models/user.model';
import { toUserError } from '../utils/firebase-error.util';
import { UserService } from './user.service';

export interface SignUpPayload {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly phone: string;
}

/**
 * Single owner of the authentication state.
 *
 * Holds the raw Firebase auth user plus the matching Firestore profile (role,
 * owned restaurants). Both are signals, so the header, guards and feature
 * pages all read one source of truth instead of subscribing independently.
 *
 * The two `when*Ready` promises exist because Firebase resolves the session
 * *asynchronously*. Without them, a page refresh on a protected route would
 * evaluate `isLoggedIn()` as `false` for a few frames and bounce a signed-in
 * user to `/login`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  private readonly firebaseUser = signal<FirebaseUser | null>(null);
  private readonly profile = signal<UserProfile | null>(null);
  private readonly initialised = signal(false);

  /** Resolves once the profile fetch for the current user has settled. */
  private profileFetch: Promise<void> = Promise.resolve();

  private resolveInitialAuth!: () => void;
  private readonly initialAuthState = new Promise<void>((resolve) => {
    this.resolveInitialAuth = resolve;
  });

  // ------------------------------------------------------------- public state

  /** The Firebase user, or `null` when signed out. */
  readonly user = this.firebaseUser.asReadonly();

  /** Firestore profile of the signed-in user, or `null`. */
  readonly currentUser = this.profile.asReadonly();

  /** `true` once the first `onAuthStateChanged` callback has fired. */
  readonly ready = this.initialised.asReadonly();

  /** `true` while the profile is still in flight — drives skeleton states. */
  readonly profileLoading = signal(false);

  readonly isLoggedIn = computed(() => this.firebaseUser() !== null);
  readonly uid = computed(() => this.firebaseUser()?.uid ?? null);
  readonly email = computed(() => this.firebaseUser()?.email ?? '');
  readonly role = computed<UserRole>(() => this.profile()?.role ?? 'customer');
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isOwner = computed(() => this.role() === 'owner');
  readonly displayName = computed(() => this.profile()?.displayName ?? '');
  readonly photoURL = computed(() => this.profile()?.photoURL ?? null);
  readonly ownedRestaurantIds = computed(() => this.profile()?.restaurantIds ?? []);

  // ------------------------------------------------------------------ awaiting

  /** Resolves once Firebase Auth has reported the initial session. */
  async whenReady(): Promise<void> {
    await this.initialAuthState;
  }

  /**
   * Resolves once the Firestore profile for the signed-in user has been
   * fetched (or has definitively failed). Role guards must await this:
   * reading `role()` before the profile lands would always see the `customer`
   * default and lock owners out of their own dashboard.
   */
  async whenProfileReady(): Promise<void> {
    await this.initialAuthState;
    await this.profileFetch;
  }

  constructor() {
    // Exactly one auth listener for the whole app lifetime. Every consumer
    // reads the signals above instead of calling `onAuthStateChanged` again.
    onAuthStateChanged(this.auth, (user) => {
      this.firebaseUser.set(user);
      this.initialised.set(true);
      this.resolveInitialAuth();
      void this.syncProfile(user);
    });
  }

  // ------------------------------------------------------------------- actions

  async signIn(email: string, password: string): Promise<void> {
    await runGuarded(() => signInWithEmailAndPassword(this.auth, email, password));
    // Backfills a profile for accounts created outside this app.
    const user = this.firebaseUser();
    if (user) {
      await runGuarded(() =>
        this.userService.ensureProfile(user.uid, {
          email: user.email ?? '',
          displayName: user.displayName ?? 'ZaikaHub user',
          phone: user.phoneNumber ?? '',
        }),
      );
    }
  }

  /**
   * Registers a new customer account and writes the profile document in the
   * same flow, so a signed-in user always has a profile to authorise against.
   */
  async signUp(payload: SignUpPayload): Promise<string> {
    const credential = await runGuarded(() =>
      createUserWithEmailAndPassword(this.auth, payload.email, payload.password),
    );
    const user = credential.user;

    await runGuarded(() =>
      updateProfile(user, {
        displayName: payload.displayName,
        ...(payload.phone ? { phoneNumber: payload.phone } : {}),
      }),
    );

    await runGuarded(() =>
      this.userService.createProfile({
        uid: user.uid,
        email: user.email ?? payload.email,
        displayName: payload.displayName,
        phone: payload.phone,
      }),
    );

    return user.uid;
  }

  async sendResetEmail(email: string): Promise<void> {
    await runGuarded(() => sendPasswordResetEmail(this.auth, email));
  }

  async signOut(redirectTo = '/login'): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl(redirectTo);
  }

  /** Re-reads the profile, e.g. after the owner panel changes the user's role. */
  async reloadProfile(): Promise<void> {
    await this.syncProfile(this.firebaseUser());
  }

  /**
   * Updates the editable profile fields.
   *
   * `updateProfile` writes the Firebase Auth record; the Firestore document is
   * updated straight after so the two never disagree. The auth write is
   * optional in Firebase's API but skipped here when the value is unchanged,
   * because it forces a token refresh and a needless network round trip.
   */
  async updateProfile(changes: { displayName?: string; phone?: string }): Promise<void> {
    const uid = this.firebaseUser()?.uid;
    if (!uid) {
      throw new Error('You need to be signed in to update your profile.');
    }

    const { displayName, phone } = changes;
    const user = this.firebaseUser();

    const authChanged = (displayName !== undefined && displayName !== user?.displayName) ||
      (phone !== undefined && phone !== (user?.phoneNumber ?? ''));

    if (authChanged) {
      await runGuarded(() =>
        updateProfile(user!, {
          ...(displayName !== undefined ? { displayName } : {}),
          ...(phone !== undefined ? { phoneNumber: phone } : {}),
        }),
      );
    }

    await runGuarded(() =>
      this.userService.updateProfileFields(uid, {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(phone !== undefined ? { phone } : {}),
      }),
    );

    await this.reloadProfile();
  }

  // ------------------------------------------------------------------ internals

  private async syncProfile(user: FirebaseUser | null): Promise<void> {
    if (!user) {
      this.profile.set(null);
      this.profileFetch = Promise.resolve();
      return;
    }

    this.profileLoading.set(true);
    this.profileFetch = firstValueFrom(this.userService.getProfile(user.uid))
      .then((profile) => this.profile.set(profile))
      .catch((error: unknown) => {
        console.error('[auth] failed to load profile', error);
        this.profile.set(null);
      })
      .finally(() => this.profileLoading.set(false));

    await this.profileFetch;
  }
}

/** Runs a Firebase promise and rethrows it as a user-facing {@link AppError}. */
async function runGuarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toUserError(error);
  }
}
