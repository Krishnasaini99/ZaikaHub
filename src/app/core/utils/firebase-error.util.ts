/**
 * Maps raw Firebase errors onto messages a customer can actually act on.
 *
 * Firebase error codes are stable API surface, but the default English
 * messages are not, so we own the copy here and never leak SDK internals.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters long.',
  'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection and retry.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
};

const STORAGE_MESSAGES: Record<string, string> = {
  'storage/unauthorized': 'You do not have permission to upload this file.',
  'storage/canceled': 'Upload cancelled.',
  'storage/quota-exceeded': 'Storage quota exceeded.',
  'storage/retry-limit-exceeded': 'Upload timed out. Please try again.',
  'storage/invalid-argument': 'That file could not be processed.',
};

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': 'You do not have permission to perform this action.',
  'not-found': 'The requested item no longer exists.',
  'unavailable': 'Service temporarily unavailable. Please retry.',
  'deadline-exceeded': 'The request took too long. Please retry.',
  'already-exists': 'That item already exists.',
  'failed-precondition': 'This action requires the latest data. Please refresh.',
};

/** Error carrying a safe, user-facing message plus the original SDK code. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = 'unknown',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const MESSAGES: Record<string, string> = {
  ...AUTH_MESSAGES,
  ...STORAGE_MESSAGES,
  ...FIRESTORE_MESSAGES,
};

/** Converts anything thrown by Firebase into an {@link AppError}. */
export function toUserError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const code = extractCode(error);
  const message = (code && MESSAGES[code]) || 'Something went wrong. Please try again.';
  const wrapped = new AppError(message, code ?? 'unknown');
  // Preserve the original for logging without exposing it to the UI.
  wrapped.cause = error;
  return wrapped;
}

function extractCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') {
      return code;
    }
  }
  return null;
}

/** Extracts a displayable message from any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
