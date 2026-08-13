import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { clamp, pick, pickOther } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

type Swatch = { name: string; hex: string };

const SWATCHES: Swatch[] = [
  { name: 'RED', hex: '#EF4444' },
  { name: 'BLUE', hex: '#3B82F6' },
  { name: 'GREEN', hex: '#22C55E' },
  { name: 'YELLOW', hex: '#FACC15' },
  { name: 'PURPLE', hex: '#A855F7' },
  { name: 'ORANGE', hex: '#F97316' },
];

type Trial = {
  /** The colour actually filling the circle. */
  circle: Swatch;
  /** The colour name written underneath. */
  word: Swatch;
  /** Ink the word is printed in — always a colour, and never the answer. */
  ink: string;
  matches: boolean;
};

function makeTrial(level: number): Trial {
  const circle = pick(SWATCHES);
  const matches = Math.random() < 0.5;
  const word = matches ? circle : pickOther(SWATCHES, circle);
  // The word is painted from the very first round. Level 1 is congruent so the
  // rule is easy to learn; after that the ink is free to contradict both the
  // circle and the word, which is where the interference comes from.
  const ink = level === 1 ? word.hex : pick(SWATCHES).hex;
  return { circle, word, ink, matches };
}

function ColorMatch({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('lime');

  const [trial, setTrial] = useState<Trial | null>(null);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const answered = useRef(false);

  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    setVerdict(null);
    setTrial(makeTrial(api.level));
    api.setPrompt('Does the word name the colour above?');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const answer = useCallback(
    (said: boolean) => {
      if (!trial || answered.current || !api.isRunning) return;
      answered.current = true;
      const correct = said === trial.matches;
      setVerdict(correct ? 'right' : 'wrong');
      api.haptic(correct ? 'success' : 'error');
      api.submit(correct, { points: 15 + api.streak * 3, delayMs: correct ? 260 : 620 });
    },
    [api, trial],
  );

  const frameColor =
    verdict === 'right' ? theme.colors.success : verdict === 'wrong' ? theme.colors.danger : 'transparent';

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: theme.colors.bgElevated, borderColor: frameColor }]}>
        <View style={[styles.circle, { backgroundColor: trial?.circle.hex ?? theme.colors.surface }]} />
        <Text style={[styles.word, { color: trial?.ink ?? theme.colors.text }]}>
          {trial?.word.name ?? ''}
        </Text>
      </View>

      <View style={styles.answers}>
        <PressableScale
          accessibilityRole="button"
          onPress={() => answer(false)}
          style={[
            styles.answer,
            { backgroundColor: alpha(theme.colors.danger, 0.16), borderColor: alpha(theme.colors.danger, 0.5) },
          ]}
        >
          <Text style={[styles.answerGlyph, { color: theme.colors.danger }]}>✕</Text>
          <Text style={[styles.answerLabel, { color: theme.colors.danger }]}>No</Text>
        </PressableScale>

        <PressableScale
          accessibilityRole="button"
          onPress={() => answer(true)}
          style={[
            styles.answer,
            { backgroundColor: alpha(accent, 0.16), borderColor: alpha(accent, 0.5) },
          ]}
        >
          <Text style={[styles.answerGlyph, { color: accent }]}>✓</Text>
          <Text style={[styles.answerLabel, { color: accent }]}>Yes</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, justifyContent: 'space-between' },
  card: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  circle: { width: 150, height: 150, borderRadius: 75 },
  word: { fontSize: 44, fontWeight: '900', letterSpacing: 2 },
  answers: { flexDirection: 'row', gap: 14, paddingTop: 20 },
  answer: {
    flex: 1,
    height: 96,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  answerGlyph: { fontSize: 30, fontWeight: '800' },
  answerLabel: { fontSize: 14, fontWeight: '700' },
});

export const colorMatch: GameDefinition = {
  id: 'color-match',
  title: 'Colour Check',
  tagline: 'Does the word match the colour?',
  category: 'attention',
  accent: 'lime',
  glyph: '🎨',
  howToPlay: [
    'A coloured circle sits above a colour word.',
    'Answer Yes if the word names the circle’s colour, No if it does not.',
    'The word is painted a misleading colour — judge the text, not the ink.',
    'Each round has its own clock, and it gets shorter as you climb.',
  ],
  // Five lives, not three: with a hard deadline on every round a lapse of
  // attention should cost you, not end the run outright.
  session: { mode: 'timed', seconds: 60, lives: 5 },
  progression: { levelUpEvery: 6 },
  // Answer fast: from a relaxed 3.2s down to 1.4s once the levels climb.
  roundLimitMs: (level) => clamp(3400 - level * 250, 1400, 3400),
  pointsPerRound: 15,
  component: ColorMatch,
};
