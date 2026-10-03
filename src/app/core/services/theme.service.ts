import { Injectable, computed, effect, signal } from '@angular/core';

import {
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
  isThemeChoice,
  nextThemeChoice,
  resolveTheme,
  themeAttribute,
} from '../utils/theme.util';

/**
 * Keeps `<html data-theme>` in step with what the user asked for.
 *
 * The service deliberately does **not** paint the initial theme itself. That
 * job belongs to the inline script in `index.html`, which runs before first
 * paint — doing it here would mean the app boots light, then flips dark once
 * Angular reaches the header, which is exactly the flash this arrangement
 * avoids. This service owns everything *after* that: the toggle, persistence,
 * and following the OS when no choice has been made.
 *
 * Following the OS needs no listener for painting — the stylesheet's
 * `prefers-color-scheme` block does it. `matchMedia` is only mirrored here so
 * the toggle's own icon knows what is currently on screen.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  /** Mirrors the OS preference so a computed can react to it. */
  private readonly systemDark = signal(this.media.matches);

  /** `system` until the user touches the toggle; then whichever they picked. */
  readonly choice = signal<ThemeChoice>(readStoredChoice());

  /** What is painted right now. Drives the toggle's label, not the palette. */
  readonly resolved = computed<ResolvedTheme>(() =>
    resolveTheme(this.choice(), this.systemDark()),
  );

  constructor() {
    this.media.addEventListener('change', (event) => this.systemDark.set(event.matches));

    // Paint immediately rather than waiting for the first effect flush, so a
    // stale attribute left by a previous visit is corrected before anything
    // renders even if the change-detection cycle is still pending.
    this.apply();
    effect(() => this.apply());
  }

  /** Flip to the opposite of what is on screen, and remember it. */
  toggle(): void {
    this.choice.set(nextThemeChoice(this.choice(), this.systemDark()));
  }

  private apply(): void {
    const attribute = themeAttribute(this.choice());
    const root = document.documentElement;

    if (attribute) {
      root.setAttribute('data-theme', attribute);
    } else {
      // Removing the attribute is what hands control back to the CSS media
      // query — writing "system" as a value instead would need a matching
      // selector and would still be JS racing the browser's own preference.
      root.removeAttribute('data-theme');
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, this.choice());
    } catch {
      // Storage can be blocked (private mode, disabled cookies). The theme
      // still works for this visit; it just will not be remembered.
    }
  }
}

/**
 * Read the stored choice defensively.
 *
 * The value is untrusted — it has been sitting in localStorage — so a
 * corrupted or hand-edited entry falls back to `system` instead of being
 * written onto `<html>` as a selector nothing matches.
 */
function readStoredChoice(): ThemeChoice {
  try {
    const stored: unknown = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}
