import { describe, expect, it } from 'vitest';

import {
  isThemeChoice,
  nextThemeChoice,
  resolveTheme,
  themeAttribute,
} from './theme.util';

describe('resolveTheme', () => {
  it('honours an explicit light choice even when the OS prefers dark', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('honours an explicit dark choice even when the OS prefers light', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('defers to the OS when no choice has been made', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('nextThemeChoice', () => {
  it('leaves a dark screen for light', () => {
    expect(nextThemeChoice('dark', false)).toBe('light');
    expect(nextThemeChoice('dark', true)).toBe('light');
  });

  it('leaves a light screen for dark', () => {
    expect(nextThemeChoice('light', false)).toBe('dark');
    expect(nextThemeChoice('light', true)).toBe('dark');
  });

  // The subtle one: with an OS in dark mode, `system` is *showing* dark, so
  // the first press must offer light. Pressing into "dark" would look broken.
  it('flips off whatever the system is currently showing', () => {
    expect(nextThemeChoice('system', true)).toBe('light');
    expect(nextThemeChoice('system', false)).toBe('dark');
  });
});

describe('themeAttribute', () => {
  it('passes an explicit choice through', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });

  // `null` is what makes the CSS `prefers-color-scheme` block stay in charge.
  it('writes no attribute for the system choice', () => {
    expect(themeAttribute('system')).toBeNull();
  });
});

describe('isThemeChoice', () => {
  it('accepts the three valid values', () => {
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('system')).toBe(true);
  });

  // Storage is untrusted input — a corrupted value must fall back to the
  // default rather than be written straight onto <html>.
  it('rejects anything else', () => {
    expect(isThemeChoice('blue')).toBe(false);
    expect(isThemeChoice('')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
    expect(isThemeChoice(1)).toBe(false);
  });
});
