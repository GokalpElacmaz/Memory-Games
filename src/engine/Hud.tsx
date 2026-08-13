import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/Pressable';
import { alpha, useTheme } from '@/theme/theme';

type Props = {
  accent: string;
  level: number;
  score: number;
  lives: number;
  maxLives: number;
  timeLeft: number | null;
  prompt: string | null;
  /** Per-round shot clock, drawn as a draining bar. */
  round: number;
  roundLimitMs: number | null;
  /** Float over an immersive game with a readable translucent backdrop. */
  overlay?: boolean;
  onQuit: () => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Hud({
  accent,
  level,
  score,
  lives,
  maxLives,
  timeLeft,
  prompt,
  round,
  roundLimitMs,
  overlay = false,
  onQuit,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lowTime = timeLeft !== null && timeLeft <= 10;

  return (
    <View
      style={[
        styles.wrap,
        overlay && styles.overlayWrap,
        overlay && {
          backgroundColor: alpha(theme.colors.bg, 0.84),
          borderBottomColor: alpha(theme.colors.text, 0.16),
          paddingTop: insets.top + 4,
        },
      ]}
    >
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Quit game"
          onPress={onQuit}
          style={[styles.quit, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.quitGlyph, { color: theme.colors.textMuted }]}>✕</Text>
        </PressableScale>

        <View style={styles.stats}>
          <Stat label="Level" value={String(level)} />
          <Stat label="Score" value={String(score)} />
          {timeLeft !== null && (
            <Stat
              label="Time"
              value={formatTime(timeLeft)}
              tint={lowTime ? theme.colors.danger : undefined}
            />
          )}
        </View>

        {maxLives > 0 ? (
          <View style={styles.lives} accessibilityLabel={`${lives} of ${maxLives} lives left`}>
            {Array.from({ length: maxLives }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.pip,
                  {
                    backgroundColor: i < lives ? accent : alpha(theme.colors.textFaint, 0.3),
                  },
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.quit} />
        )}
      </View>

      {!overlay && (
        <Text
          numberOfLines={2}
          style={[styles.prompt, { color: prompt ? theme.colors.textMuted : 'transparent' }]}
        >
          {prompt ?? ' '}
        </Text>
      )}

      {roundLimitMs !== null && <RoundClock accent={accent} round={round} limitMs={roundLimitMs} />}
    </View>
  );
}

/** Drains once per round; driven on the UI thread so it never stutters. */
function RoundClock({ accent, round, limitMs }: { accent: string; round: number; limitMs: number }) {
  const theme = useTheme();
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 1;
    progress.value = withTiming(0, { duration: limitMs, easing: Easing.linear });
  }, [round, limitMs, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={[styles.clockTrack, { backgroundColor: alpha(theme.colors.textFaint, 0.2) }]}>
      <Animated.View style={[styles.clockFill, { backgroundColor: accent }, fill]} />
    </View>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: theme.colors.textFaint }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color: tint ?? theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  overlayWrap: {
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quit: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  quitGlyph: { fontSize: 17, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 20 },
  stat: { alignItems: 'center', minWidth: 46 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  lives: { flexDirection: 'row', gap: 5, width: 40, justifyContent: 'flex-end' },
  pip: { width: 9, height: 9, borderRadius: 5 },
  prompt: { textAlign: 'center', marginTop: 10, fontSize: 14, fontWeight: '600', minHeight: 36 },
  clockTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  clockFill: { height: '100%', borderRadius: 2 },
});
