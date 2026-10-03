/**
 * Theme resolution.
 *
 * Kept separate from `ThemeService` so the decision — which is the part that
 * can quietly regress — is a pure function with no DOM, no storage and no
 * `matchMedia`, and therefore testable in isolation.
 */

/**
 * What the user has asked for.
 *
 * `system` is the default until they touch the toggle, and it means "no
 * opinion": no attribute is written, so the stylesheet's
 * `prefers-color-scheme` block decides. That is deliberately not the same as
 * resolving to whatever the OS says *right now*, because a user who never
 * touched the toggle should keep following the OS if it changes later.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

/** What actually gets painted. */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key. Must match the one `index.html` reads before first paint. */
export const THEME_STORAGE_KEY = 'zaika-hub.theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Turn a choice plus the OS preference into a painted theme.
 *
 * An explicit choice always wins; only `system` defers to the OS. Both callers
 * use it — the service for `data-theme`, and the toggle for its own label — so
 * the button can never disagree with the page it is controlling.
 */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return choice;
}

/**
 * What clicking the toggle should switch to.
 *
 * From `system` this lands on the *opposite* of what is currently on screen
 * rather than blindly on `dark`: if the OS is already dark, "no opinion" is
 * showing dark, so offering dark again would look like a button that does
 * nothing on first press.
 */
export function nextThemeChoice(choice: ThemeChoice, prefersDark: boolean): ThemeChoice {
  return resolveTheme(choice, prefersDark) === 'dark' ? 'light' : 'dark';
}

/**
 * The `data-theme` attribute value, or `null` for "leave it to the OS".
 *
 * Returning `null` rather than a literal string is what lets the CSS media
 * query keep owning the `system` case instead of JS racing it.
 */
export function themeAttribute(choice: ThemeChoice): 'light' | 'dark' | null {
  return choice === 'system' ? null : choice;
}
