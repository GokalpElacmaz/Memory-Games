import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { sampleIndices } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { useTheme } from '@/theme/theme';

/**
 * Board size and number of lit cells per level. The last entry repeats with one
 * extra cell per level, so the game never runs out of difficulty.
 */
const STAGES: { size: number; counts: number[] }[] = [
  { size: 4, counts: [6, 7, 8] },
  { size: 5, counts: [10, 11, 12, 13] },
  { size: 6, counts: [15, 16, 17, 18, 19] },
  { size: 7, counts: [21, 22, 23, 24, 25, 26] },
  { size: 8, counts: [28, 29, 30, 31, 32, 33, 34] },
];

export function levelSpec(level: number): { size: number; count: number } {
  let remaining = level - 1;
  for (const stage of STAGES) {
    if (remaining < stage.counts.length) return { size: stage.size, count: stage.counts[remaining] };
    remaining -= stage.counts.length;
  }
  const last = STAGES[STAGES.length - 1];
  const max = last.size * last.size - 4;
  return {
    size: last.size,
    count: Math.min(max, last.counts[last.counts.length - 1] + remaining + 1),
  };
}

/** How long the pattern stays visible before it hides. */
function memoriseMs(count: number): number {
  return 900 + count * 130;
}

type Phase = 'memorise' | 'recall' | 'reveal';

function MemoryGrid({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('emerald');
  const { size, count } = levelSpec(api.level);

  const [phase, setPhase] = useState<Phase>('memorise');
  const [target, setTarget] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [missed, setMissed] = useState<number | null>(null);
  const submitted = useRef(false);

  // A new round: draw a fresh pattern and show it.
  useEffect(() => {
    if (!api.round) return;
    submitted.current = false;
    setTarget(sampleIndices(size * size, count));
    setFound([]);
    setMissed(null);
    setPhase('memorise');
    api.setPrompt('Memorise the lit cells');

    const id = setTimeout(() => {
      setPhase('recall');
      api.setPrompt(`Tap the ${count} cells you saw`);
    }, memoriseMs(count) + api.memoriseBonusMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const onCellPress = useCallback(
    (index: number) => {
      if (phase !== 'recall' || submitted.current || found.includes(index)) return;

      if (target.includes(index)) {
        const next = [...found, index];
        setFound(next);
        api.haptic('light');
        if (next.length === target.length) {
          submitted.current = true;
          setPhase('reveal');
          api.setPrompt('Perfect recall');
          api.haptic('success');
          api.submit(true, { delayMs: 650 });
        }
        return;
      }

      submitted.current = true;
      setMissed(index);
      setPhase('reveal');
      api.setPrompt('Not one of them');
      api.haptic('error');
      api.submit(false, { delayMs: 1000 });
    },
    [api, found, phase, target],
  );

  const showPattern = phase === 'memorise' || phase === 'reveal';

  return (
    <Board square>
      {({ width }) => {
        const gap = Math.max(4, Math.round(width / (size * 12)));
        const cell = (width - gap * (size - 1)) / size;
        return (
          <View style={[styles.grid, { width, gap }]}>
            {Array.from({ length: size * size }, (_, index) => {
              const isTarget = target.includes(index);
              const isFound = found.includes(index);
              const lit = isFound || (showPattern && isTarget);
              const isMiss = missed === index;

              return (
                <PressableScale
                  key={index}
                  accessibilityRole="button"
                  disabled={phase !== 'recall'}
                  onPress={() => onCellPress(index)}
                  scaleTo={0.9}
                  style={[
                    styles.cell,
                    {
                      width: cell,
                      height: cell,
                      borderRadius: Math.max(6, cell * 0.22),
                      backgroundColor: isMiss
                        ? theme.colors.danger
                        : lit
                          ? accent
                          : theme.colors.surface,
                    },
                  ]}
                />
              );
            })}
          </View>
        );
      }}
    </Board>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center' },
});

export const memoryGrid: GameDefinition = {
  id: 'memory-grid',
  title: 'Memory Grid',
  tagline: 'Remember which cells lit up',
  category: 'memory',
  accent: 'emerald',
  glyph: '🟩',
  howToPlay: [
    'Some cells on the grid light up for a moment.',
    'When they hide, tap every cell that was lit.',
    'One wrong tap costs a life — the board grows as you climb.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 10 * level,
  component: MemoryGrid,
};
