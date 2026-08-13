import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/storage/settings';

import { accents, palettes, type AccentName, type ColorScheme, type Colors } from './palette';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 34, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '600' },
  mono: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: Colors;
  accents: typeof accents;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  /** Resolve a game's accent name to a hex value. */
  accent: (name: AccentName) => string;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { settings } = useSettings();

  const scheme: ColorScheme =
    settings.theme === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : settings.theme;

  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: palettes[scheme],
      accents,
      spacing,
      radius,
      type,
      accent: (name: AccentName) => accents[name],
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/** Mix a hex colour with black/white — handy for pressed/disabled states. */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  );
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const r = Math.round(((num >> 16) & 255) * (1 - t) + target * t);
  const g = Math.round(((num >> 8) & 255) * (1 - t) + target * t);
  const b = Math.round((num & 255) * (1 - t) + target * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Hex colour with an alpha channel, e.g. alpha('#22C55E', 0.2). */
export function alpha(hex: string, a: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${a})`;
}
