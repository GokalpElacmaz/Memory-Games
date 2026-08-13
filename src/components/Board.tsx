import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export type BoardSize = { width: number; height: number };

type Props = {
  /** Rendered once the container has been measured. */
  children: (size: BoardSize) => React.ReactNode;
  /** Force a square play area centred in the available space. */
  square?: boolean;
  padding?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Measures the space a game gets to draw in. Games size their cells from this
 * instead of hard-coding pixels, so they fit every phone and tablet.
 */
export function Board({ children, square = false, padding = 16, style }: Props) {
  const [size, setSize] = useState<BoardSize | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const inner = { width: Math.max(0, width - padding * 2), height: Math.max(0, height - padding * 2) };
    const next = square
      ? { width: Math.min(inner.width, inner.height), height: Math.min(inner.width, inner.height) }
      : inner;
    setSize((prev) =>
      prev && Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1
        ? prev
        : next,
    );
  };

  return (
    <View onLayout={onLayout} style={[styles.wrap, { padding }, style]}>
      {size && size.width > 0 ? children(size) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
