import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { pick, sampleIndices } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { useTheme } from '@/theme/theme';

/**
 * Smaller boards and fewer cells than Memory Grid — the work here is holding
 * the pattern through the spin, not memorising a dense field.
 */
const STAGES: { size: number; counts: number[] }[] = [
  { size: 3, counts: [3, 4] },
  { size: 4, counts: [4, 5, 6] },
  { size: 5, counts: [6, 7, 8, 9] },
  { size: 6, counts: [9, 10, 11, 12] },
];

const ANGLES = [90, 180, 270] as const;

/**
 * A bar along one edge of the board. With the pattern hidden, a square of
 * identical cells gives no sign that it turned — this is what the player reads
 * the rotation from.
 */
const MARKER_HEIGHT = 6;
const MARKER_GAP = 12;

function levelSpec(level: number): { size: number; count: number } {
  let remaining = level - 1;
  for (const stage of STAGES) {
    if (remaining < stage.counts.length) return { size: stage.size, count: stage.counts[remaining] };
    remaining -= stage.counts.length;
  }
  const last = STAGES[STAGES.length - 1];
  const max = last.size * last.size - 6;
  return {
    size: last.size,
    count: Math.min(max, last.counts[last.counts.length - 1] + remaining + 1),
  };
}

const STUDY_MS = 1400;
/** Blank beat after the pattern hides, before the board starts to move. */
const HIDE_MS = 400;
/**
 * Time per quarter turn, so a half or three-quarter turn takes proportionally
 * longer instead of whipping round at the same speed. A constant duration made
 * 180° and 270° impossible to follow.
 */
const MS_PER_QUARTER = 1500;

const spinDuration = (turn: number) => (turn / 90) * MS_PER_QUARTER;

type Phase = 'memorise' | 'hide' | 'spin' | 'recall' | 'reveal';

function RotatingGrid({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('blue');
  const { size, count } = levelSpec(api.level);

  const [phase, setPhase] = useState<Phase>('memorise');
  const [target, setTarget] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [missed, setMissed] = useState<number | null>(null);
  const submitted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Which round a spin belongs to, so a callback that lands late is ignored.
  const spinRound = useRef(0);

  // The whole board turns, so a cell keeps its index while changing position —
  // no coordinate remapping, the player simply follows the pattern round.
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!api.round) return;
    submitted.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const turn = pick(ANGLES);
    setTarget(sampleIndices(size * size, count));
    setFound([]);
    setMissed(null);
    setPhase('memorise');
    rotation.value = 0;
    api.setPrompt('Memorise the pattern');

    const study = STUDY_MS + api.memoriseBonusMs;
    const thisRound = api.round;
    spinRound.current = thisRound;

    // Recall opens when the board actually settles, not on a parallel timer —
    // otherwise a slow frame lets the player tap while it is still turning.
    const openRecall = () => {
      if (spinRound.current !== thisRound) return;
      setPhase('recall');
      api.setPrompt('Tap where the pattern is now');
    };

    // Hide first, then turn: the player has to carry the pattern through the
    // rotation in their head. The marker bar is what makes the turn legible
    // once the cells are dark.
    timers.current.push(
      setTimeout(() => {
        setPhase('hide');
        api.setPrompt('Watch which way it turns');
      }, study),
    );

    timers.current.push(
      setTimeout(() => {
        setPhase('spin');
        api.setPrompt(`Turning ${turn}°`);
        rotation.value = withTiming(
          turn,
          { duration: spinDuration(turn), easing: Easing.inOut(Easing.quad) },
          (finished) => {
            if (finished) runOnJS(openRecall)();
          },
        );
      }, study + HIDE_MS),
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
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
          api.setPrompt('You followed it round');
          api.haptic('success');
          api.submit(true, { delayMs: 650 });
        }
        return;
      }

      submitted.current = true;
      setMissed(index);
      setPhase('reveal');
      api.setPrompt('That is not where it landed');
      api.haptic('error');
      api.submit(false, { delayMs: 1000 });
    },
    [api, found, phase, target],
  );

  const boardStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // The pattern is gone before the board moves — that is the whole task.
  const showPattern = phase === 'memorise' || phase === 'reveal';

  return (
    <Board square>
      {({ width }) => {
        // Leave room above and below for the marker, keeping the grid centred
        // inside the rotating container so it turns about its own middle.
        const boardWidth = width - (MARKER_HEIGHT + MARKER_GAP) * 2;
        const gap = Math.max(5, Math.round(boardWidth / (size * 12)));
        const cell = (boardWidth - gap * (size - 1)) / size;

        return (
          <Animated.View style={[styles.board, { width: boardWidth }, boardStyle]}>
            <View
              style={[
                styles.marker,
                { width: boardWidth * 0.45, marginBottom: MARKER_GAP, backgroundColor: accent },
              ]}
            />

            <View style={[styles.grid, { width: boardWidth, gap }]}>
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
                        borderRadius: Math.max(6, cell * 0.2),
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

            {/* Balances the marker so the grid sits at the centre of rotation. */}
            <View style={styles.markerBalance} />
          </Animated.View>
        );
      }}
    </Board>
  );
}

const styles = StyleSheet.create({
  board: { alignItems: 'center' },
  marker: { height: MARKER_HEIGHT, borderRadius: MARKER_HEIGHT / 2 },
  markerBalance: { height: MARKER_HEIGHT, marginTop: MARKER_GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center' },
});

export const rotatingGrid: GameDefinition = {
  id: 'rotating-grid',
  title: 'Rotating Grid',
  tagline: 'Follow the pattern as the board turns',
  category: 'memory',
  accent: 'blue',
  glyph: '🔄',
  howToPlay: [
    'A pattern lights up, then hides.',
    'The board then turns 90°, 180° or 270° — the coloured bar shows which way.',
    'Tap where the pattern is now, not where you first saw it.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 12 * level,
  component: RotatingGrid,
};
