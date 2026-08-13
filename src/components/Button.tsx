import React from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, useTheme } from '@/theme/theme';

import { PressableScale } from './Pressable';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Hex colour; defaults to the theme's success green. */
  tint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', tint, disabled, style }: Props) {
  const theme = useTheme();
  const color = tint ?? theme.accents.emerald;

  const surface: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: color }
      : variant === 'secondary'
        ? { backgroundColor: alpha(color, 0.16), borderWidth: 1, borderColor: alpha(color, 0.4) }
        : { backgroundColor: 'transparent' };

  // Every accent is a light, saturated tone, so dark ink reads better on a
  // filled button in both themes.
  const textColor = variant === 'primary' ? '#0B1020' : color;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.base, surface, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
