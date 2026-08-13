import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { sample } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

type Hex = { q: number; r: number };

const STAGES: { radius: number; counts: number[] }[] = [
  { radius: 1, counts: [3, 4] },
  { radius: 2, counts: [6, 7, 8, 9] },
  { radius: 3, counts: [12, 14, 16, 18, 20] },
  { radius: 4, counts: [24, 26, 28, 30, 32, 34] },
];

function levelSpec(level: number): { radius: number; count: number } {
  let remaining = level - 1;
  for (const stage of STAGES) {
    if (remaining < stage.counts.length) return { radius: stage.radius, count: stage.counts[remaining] };
    remaining -= stage.counts.length;
  }
  const last = STAGES[STAGES.length - 1];
  const cells = 3 * last.radius * (last.radius + 1) + 1;
  return {
    radius: last.radius,
    count: Math.min(cells - 6, last.counts[last.counts.length - 1] + remaining + 1),
  };
}

/** Every hex within `radius` rings of the centre, in axial coordinates. */
function hexField(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

const SQRT3 = Math.sqrt(3);

/** Circumradius ceiling — keeps a 7-tile comb from filling a whole tablet. */
const MAX_HEX_SIZE = 48;

/** Pointy-top axial coordinates to pixels, centred on (0, 0). */
function hexCenter(hex: Hex, s: number) {
  return { x: s * SQRT3 * (hex.q + hex.r / 2), y: s * 1.5 * hex.r };
}

function hexPoints(cx: number, cy: number, s: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    return `${(cx + s * Math.cos(angle)).toFixed(2)},${(cy + s * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

function memoriseMs(count: number): number {
  return 1000 + count * 150;
}

type Phase = 'memorise' | 'recall' | 'reveal';

function MemoryHex({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('cyan');
  const { radius, count } = levelSpec(api.level);

  const field = useMemo(() => hexField(radius), [radius]);
  const [target, setTarget] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [missed, setMissed] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('memorise');
  const submitted = useRef(false);

  useEffect(() => {
    if (!api.round) return;
    submitted.current = false;
    setTarget(sample(field.map((_, i) => i), count));
    setFound([]);
    setMissed(null);
    setPhase('memorise');
    api.setPrompt('Memorise the lit tiles');

    const id = setTimeout(() => {
      setPhase('recall');
      api.setPrompt(`Tap the ${count} tiles you saw`);
    }, memoriseMs(count) + api.memoriseBonusMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const onHexPress = useCallback(
    (index: number) => {
      if (phase !== 'recall' || submitted.current || found.includes(index)) return;

      if (target.includes(index)) {
        const next = [...found, index];
        setFound(next);
        api.haptic('light');
        if (next.length === target.length) {
          submitted.current = true;
          setPhase('reveal');
          api.setPrompt('All found');
          api.haptic('success');
          api.submit(true, { delayMs: 650 });
        }
        return;
      }

      submitted.current = true;
      setMissed(index);
      setPhase('reveal');
      api.setPrompt('That one was dark');
      api.haptic('error');
      api.submit(false, { delayMs: 1000 });
    },
    [api, found, phase, target],
  );

  const showPattern = phase === 'memorise' || phase === 'reveal';

  return (
    <Board>
      {({ width, height }) => {
        // Fit the hex field to whichever axis runs out first.
        // Cap the tile size so a small comb does not balloon on a tablet.
        const s = Math.min(
          width / (SQRT3 * (2 * radius + 1)),
          height / (1.5 * 2 * radius + 2),
          MAX_HEX_SIZE,
        );
        const inner = s * 0.93;
        const cx = width / 2;
        const cy = height / 2;
        const hit = s * 1.55;

        return (
          <View style={{ width, height }}>
            <Svg width={width} height={height}>
              {field.map((hex, index) => {
                const { x, y } = hexCenter(hex, s);
                const isTarget = target.includes(index);
                const isFound = found.includes(index);
                const lit = isFound || (showPattern && isTarget);
                const isMiss = missed === index;

                return (
                  <Polygon
                    key={`${hex.q},${hex.r}`}
                    points={hexPoints(cx + x, cy + y, inner)}
                    fill={isMiss ? theme.colors.danger : lit ? accent : theme.colors.surface}
                    stroke={lit && !isMiss ? alpha('#FFFFFF', 0.35) : theme.colors.border}
                    strokeWidth={1.5}
                  />
                );
              })}
            </Svg>

            {/* Touch targets sit above the drawing: react-native-svg press
                handling is inconsistent on web, and this keeps hit areas honest. */}
            {field.map((hex, index) => {
              const { x, y } = hexCenter(hex, s);
              return (
                <PressableScale
                  key={`hit-${hex.q},${hex.r}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Tile ${index + 1}`}
                  disabled={phase !== 'recall'}
                  onPress={() => onHexPress(index)}
                  scaleTo={0.92}
                  style={{
                    position: 'absolute',
                    left: cx + x - hit / 2,
                    top: cy + y - hit / 2,
                    width: hit,
                    height: hit,
                  }}
                />
              );
            })}
          </View>
        );
      }}
    </Board>
  );
}

export const memoryHex: GameDefinition = {
  id: 'memory-hex',
  title: 'Memory Hex',
  tagline: 'The grid game, on honeycomb',
  category: 'memory',
  accent: 'cyan',
  glyph: '⬡',
  howToPlay: [
    'Tiles on a honeycomb light up briefly.',
    'Once they fade, tap every tile that was lit.',
    'The comb grows a ring wider as you progress.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 12 * level,
  component: MemoryHex,
};
