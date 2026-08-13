import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { pick, sample, shuffle } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { accents } from '@/theme/palette';
import { alpha, useTheme } from '@/theme/theme';

const GLYPHS = ['△', '○', '□', '◇', '✕', '★', '≡', '✚', '▽', '⬠', '∞', '☰'] as const;

/**
 * Colours grouped by hue. A round draws at most one from each family, so two
 * tiles are never a shade apart — cyan and blue together made the sequence
 * unreadable rather than hard.
 */
const COLOR_FAMILIES: string[][] = [
  [accents.blue, accents.cyan],
  [accents.emerald, accents.lime],
  [accents.amber, accents.orange],
  [accents.rose],
  [accents.violet],
];

/** Distinct-hue colours can never collide, so this caps a round's palette. */
const MAX_COLORS = 4;

type SymbolTile = { glyph: string; color: string; key: string };

function levelSpec(level: number) {
  return {
    sequenceLength: Math.min(2 + level, 9),
    paletteSize: Math.min(4 + level, 12),
    // Deliberately generous: the task is order, not perception.
    flashMs: Math.max(620, 1000 - level * 25),
  };
}

/** One colour per hue family, then every glyph in those colours. */
function buildPool(): SymbolTile[] {
  const colors = sample(COLOR_FAMILIES, MAX_COLORS).map((family) => pick(family));
  return GLYPHS.flatMap((glyph) =>
    colors.map((color) => ({ glyph, color, key: `${glyph}:${color}` })),
  );
}

type Phase = 'show' | 'recall' | 'reveal';

function SymbolSequence({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('amber');
  const spec = levelSpec(api.level);

  const [sequence, setSequence] = useState<SymbolTile[]>([]);
  const [palette, setPalette] = useState<SymbolTile[]>([]);
  const [cursor, setCursor] = useState(0);
  const [entered, setEntered] = useState(0);
  const [phase, setPhase] = useState<Phase>('show');
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const answered = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const chosen = sample(buildPool(), spec.paletteSize);
    const seq = chosen.slice(0, spec.sequenceLength);
    setSequence(seq);
    setPalette(shuffle(chosen));
    setEntered(0);
    setWrongKey(null);
    setCursor(0);
    setPhase('show');
    api.setPrompt('Watch the order');

    // Flash the sequence one tile at a time, then hand control back.
    const step = spec.flashMs + 180 + api.memoriseBonusMs / spec.sequenceLength;
    for (let i = 1; i <= seq.length; i++) {
      timers.current.push(setTimeout(() => setCursor(i), step * i));
    }
    timers.current.push(
      setTimeout(() => {
        setPhase('recall');
        api.setPrompt('Now tap them in the same order');
      }, step * seq.length),
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const onTilePress = useCallback(
    (symbol: SymbolTile) => {
      if (phase !== 'recall' || answered.current) return;

      if (symbol.key === sequence[entered].key) {
        const next = entered + 1;
        setEntered(next);
        api.haptic('light');
        if (next === sequence.length) {
          answered.current = true;
          setPhase('reveal');
          api.setPrompt('Sequence complete');
          api.haptic('success');
          api.submit(true, { delayMs: 600 });
        }
        return;
      }

      answered.current = true;
      setWrongKey(symbol.key);
      setPhase('reveal');
      api.setPrompt(`Position ${entered + 1} was ${sequence[entered].glyph}`);
      api.haptic('error');
      api.submit(false, { delayMs: 1100 });
    },
    [api, entered, phase, sequence],
  );

  const showing = phase === 'show' ? sequence[cursor] : undefined;

  return (
    <Board padding={20}>
      {({ width }) => {
        const columns = spec.paletteSize <= 6 ? 3 : 4;
        const gap = 12;
        const tile = Math.min(96, (width - gap * (columns - 1)) / columns);

        return (
          <View style={styles.wrap}>
            <View style={styles.stageArea}>
              {phase === 'show' ? (
                showing ? (
                  <Animated.View
                    key={cursor}
                    entering={FadeIn.duration(120)}
                    exiting={FadeOut.duration(120)}
                    style={[styles.showcase, { backgroundColor: showing.color }]}
                  >
                    <Text style={styles.showcaseGlyph}>{showing.glyph}</Text>
                  </Animated.View>
                ) : (
                  <View style={[styles.showcase, { backgroundColor: theme.colors.surface }]} />
                )
              ) : (
                <View style={styles.progressRow}>
                  {sequence.map((symbol, i) => (
                    <View
                      key={i}
                      style={[
                        styles.progressPip,
                        {
                          backgroundColor:
                            i < entered ? symbol.color : alpha(theme.colors.textFaint, 0.28),
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.palette, { gap, width: tile * columns + gap * (columns - 1) }]}>
              {palette.map((symbol) => {
                const isWrong = wrongKey === symbol.key;
                const isNextAnswer = phase === 'reveal' && symbol.key === sequence[entered]?.key;
                return (
                  <PressableScale
                    key={symbol.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Symbol ${symbol.glyph}`}
                    disabled={phase !== 'recall'}
                    onPress={() => onTilePress(symbol)}
                    style={[
                      styles.tile,
                      {
                        width: tile,
                        height: tile,
                        borderRadius: tile * 0.26,
                        backgroundColor: symbol.color,
                        opacity: phase === 'show' ? 0.25 : 1,
                        borderWidth: isWrong || isNextAnswer ? 3 : 0,
                        borderColor: isWrong ? theme.colors.danger : theme.colors.text,
                      },
                    ]}
                  >
                    <Text style={styles.tileGlyph}>{symbol.glyph}</Text>
                  </PressableScale>
                );
              })}
            </View>

            <View style={[styles.footer, { borderColor: alpha(accent, 0.25) }]}>
              <Text style={[styles.footerText, { color: theme.colors.textFaint }]}>
                {sequence.length} symbols · {spec.paletteSize} tiles
              </Text>
            </View>
          </View>
        );
      }}
    </Board>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 28 },
  stageArea: { height: 140, alignItems: 'center', justifyContent: 'center' },
  showcase: { width: 116, height: 116, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  showcaseGlyph: { fontSize: 58, color: '#0B1020', fontWeight: '700' },
  progressRow: { flexDirection: 'row', gap: 8 },
  progressPip: { width: 14, height: 14, borderRadius: 7 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  tileGlyph: { fontSize: 34, color: '#0B1020', fontWeight: '700' },
  footer: { paddingTop: 14, borderTopWidth: 1, width: '60%', alignItems: 'center' },
  footerText: { fontSize: 12, fontWeight: '600' },
});

export const symbolSequence: GameDefinition = {
  id: 'symbol-sequence',
  title: 'Symbol Order',
  tagline: 'Replay the sequence of signs',
  category: 'memory',
  accent: 'amber',
  glyph: '🔣',
  howToPlay: [
    'Symbols flash one after another in a set order.',
    'When the tile board appears, tap them in that same order.',
    'Sequences get longer and the board gets busier each level.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 15 * level,
  component: SymbolSequence,
};
