import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { Shape, shapeKinds, type ShapeKind } from '@/components/Shape';
import { clamp, pick, sample, sampleIndices, shuffle } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { accents } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

const PAINTS = [
  accents.amber,
  accents.emerald,
  accents.rose,
  accents.blue,
  accents.violet,
  accents.cyan,
] as const;

type Combo = { kind: ShapeKind; color: string };
type Item = Combo & { id: number; slot: number; jitterX: number; jitterY: number };

function levelSpec(level: number) {
  return {
    /** How many shapes are on screen. This is the main difficulty dial. */
    total: Math.min(8 + Math.round(level * 1.6), 40),
    kinds: clamp(2 + Math.floor((level - 1) / 5), 2, shapeKinds.length),
    colors: clamp(2 + Math.floor((level - 1) / 6), 2, PAINTS.length),
  };
}

const comboKey = (combo: Combo) => `${combo.kind}:${combo.color}`;

/**
 * Builds a board where exactly one shape/colour pair occurs once and every
 * other pair occurs at least twice.
 *
 * The odd one out always shares its shape with some items and its colour with
 * others, so scanning for "the only star" or "the only purple" never works —
 * you have to hold the combination in mind.
 */
function buildRound(level: number, slotCount: number): { items: Item[]; answerId: number } {
  const spec = levelSpec(level);
  const kinds = sample(shapeKinds, spec.kinds);
  const colors = sample(PAINTS, spec.colors);

  const odd: Combo = { kind: pick(kinds), color: pick(colors) };

  const others = kinds
    .flatMap((kind) => colors.map((color) => ({ kind, color })))
    .filter((combo) => comboKey(combo) !== comboKey(odd));

  // Seed the fillers so the odd one's shape and its colour both appear elsewhere.
  const shapeMates = others.filter((c) => c.kind === odd.kind);
  const colorMates = others.filter((c) => c.color === odd.color);
  const seeded: Combo[] = [];
  if (shapeMates.length) seeded.push(pick(shapeMates));
  if (colorMates.length) seeded.push(pick(colorMates));

  const remaining = others.filter((c) => !seeded.some((s) => comboKey(s) === comboKey(c)));
  // Aim for ~3 copies of each filler, but never more fillers than we can double up.
  const fillerTarget = clamp(Math.round((spec.total - 1) / 3), seeded.length, others.length);
  const maxFillers = Math.max(seeded.length, Math.floor((spec.total - 1) / 2));
  const fillerCount = Math.min(fillerTarget, maxFillers);
  const fillers = [...seeded, ...sample(remaining, Math.max(0, fillerCount - seeded.length))];

  // Two of each filler first, then hand out what is left at random.
  const bag: Combo[] = fillers.flatMap((combo) => [combo, combo]);
  while (bag.length < spec.total - 1) bag.push(pick(fillers));

  const slots = shuffle(sampleIndices(slotCount, Math.min(spec.total, slotCount)));
  const combos = shuffle([odd, ...bag.slice(0, spec.total - 1)]);

  const items: Item[] = combos.slice(0, slots.length).map((combo, index) => ({
    ...combo,
    id: index,
    slot: slots[index],
    jitterX: Math.random() * 0.24 - 0.12,
    jitterY: Math.random() * 0.24 - 0.12,
  }));

  // The odd one may have been trimmed if the board ran out of slots; if so the
  // last remaining single-occurrence pair becomes the answer instead.
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(comboKey(item), (counts.get(comboKey(item)) ?? 0) + 1));
  const answer = items.find((item) => counts.get(comboKey(item)) === 1);

  if (!answer) return buildRound(level, slotCount);
  return { items, answerId: answer.id };
}

/** Grid of slots the shapes scatter across, sized to the space available. */
function gridFor(total: number, width: number, height: number) {
  const slotCount = Math.ceil(total * 1.5);
  const cols = Math.max(3, Math.round(Math.sqrt((slotCount * width) / height)));
  const rows = Math.ceil(slotCount / cols);
  return { cols, rows, slots: cols * rows, cell: Math.min(width / cols, height / rows) };
}

function OneAndOnly({ api }: GameComponentProps) {
  const theme = useTheme();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const grid = useMemo(
    () =>
      layout.width > 0 ? gridFor(levelSpec(api.level).total, layout.width, layout.height) : null,
    [api.level, layout],
  );

  const [round, setRound] = useState<{ items: Item[]; answerId: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const answered = useRef(false);

  useEffect(() => {
    if (!api.round || !grid) return;
    answered.current = false;
    setPicked(null);
    setRound(buildRound(api.level, grid.slots));
    api.setPrompt('One shape and colour appears only once — tap it');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round, grid?.slots]);

  const choose = useCallback(
    (item: Item) => {
      if (!round || answered.current) return;
      answered.current = true;
      setPicked(item.id);

      const correct = item.id === round.answerId;
      api.setPrompt(correct ? 'That was the only one' : 'That pair appeared more than once');
      api.haptic(correct ? 'success' : 'error');
      api.submit(correct, { delayMs: correct ? 480 : 1100 });
    },
    [api, round],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  const itemSize = grid ? grid.cell * 0.78 : 0;
  const offsetX = grid ? (layout.width - grid.cols * grid.cell) / 2 : 0;
  const offsetY = grid ? (layout.height - grid.rows * grid.cell) / 2 : 0;
  const revealed = picked !== null;

  return (
    <View style={styles.stage} onLayout={onLayout}>
      {grid &&
        round?.items.map((shape) => {
          const col = shape.slot % grid.cols;
          const row = Math.floor(shape.slot / grid.cols);
          const isAnswer = shape.id === round.answerId;

          return (
            <PressableScale
              key={shape.id}
              accessibilityRole="button"
              accessibilityLabel={`${shape.kind} shape`}
              disabled={revealed}
              onPress={() => choose(shape)}
              scaleTo={0.88}
              style={[
                styles.item,
                {
                  width: grid.cell,
                  height: grid.cell,
                  borderRadius: grid.cell / 2,
                  left: offsetX + (col + shape.jitterX) * grid.cell,
                  top: offsetY + (row + shape.jitterY) * grid.cell,
                  borderWidth: revealed && (isAnswer || shape.id === picked) ? 3 : 0,
                  borderColor: isAnswer ? theme.colors.success : theme.colors.danger,
                  opacity: revealed && !isAnswer && shape.id !== picked ? 0.35 : 1,
                },
              ]}
            >
              <Shape kind={shape.kind} size={itemSize} color={shape.color} />
            </PressableScale>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, margin: 12 },
  item: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});

export const oneAndOnly: GameDefinition = {
  id: 'one-and-only',
  title: 'One and Only',
  tagline: 'Find the pair that appears once',
  category: 'logic',
  accent: 'violet',
  glyph: '🔷',
  howToPlay: [
    'The board fills with shapes in a handful of colours.',
    'Every shape-and-colour pair repeats — except one.',
    'Tap the single odd one out. More shapes arrive each level.',
  ],
  session: { mode: 'timed', seconds: 60, lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 12 * level,
  component: OneAndOnly,
};
