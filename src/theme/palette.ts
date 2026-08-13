/**
 * Colour tokens. Every value used by a screen or a game must come from here so
 * that a new game inherits the app's look without inventing its own palette.
 */

export type ColorScheme = 'light' | 'dark';

/** Accents are shared by games; pick one in the game definition. */
export const accents = {
  emerald: '#22C55E',
  cyan: '#22D3EE',
  violet: '#A78BFA',
  amber: '#FBBF24',
  rose: '#FB7185',
  orange: '#FB923C',
  blue: '#60A5FA',
  lime: '#A3E635',
} as const;

export type AccentName = keyof typeof accents;

const dark = {
  bg: '#0E1220',
  bgElevated: '#161B2E',
  surface: '#1C2238',
  surfaceAlt: '#242C46',
  border: '#2E3757',
  text: '#F3F5FB',
  textMuted: '#9AA3BE',
  textFaint: '#6B7490',
  danger: '#F43F5E',
  success: '#22C55E',
  warning: '#FBBF24',
  overlay: 'rgba(8, 11, 20, 0.82)',
  shadow: '#000000',
};

const light = {
  bg: '#F4F6FC',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EAEEF9',
  border: '#D8DEEE',
  text: '#131829',
  textMuted: '#5A6480',
  textFaint: '#8A93AC',
  danger: '#E11D48',
  success: '#16A34A',
  warning: '#D97706',
  overlay: 'rgba(244, 246, 252, 0.86)',
  shadow: '#0B1020',
};

export type Colors = typeof dark;

export const palettes: Record<ColorScheme, Colors> = { dark, light };
