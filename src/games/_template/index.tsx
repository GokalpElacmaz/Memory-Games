/**
 * COPY THIS FOLDER TO ADD A GAME.
 *
 *   1. cp -r src/games/_template src/games/my-game
 *   2. Rename the component and the exported definition below.
 *   3. Add it to the array in src/games/index.ts.
 *
 * Everything else — the home card, routing, countdown, score, lives, timer,
 * best-score storage, the results screen — is handled by the host. This folder
 * is not registered, so it never appears in the app until you add it yourself.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { randInt } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

/** Difficulty lives here: derive everything you need from `api.level`. */
function levelSpec(level: number) {
  return { choices: Math.min(2 + level, 6) };
}

function TemplateGame({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('blue');
  const spec = levelSpec(api.level);

  const [answer, setAnswer] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  // Guards against a double tap scoring the same round twice.
  const answered = useRef(false);

  // One round per `api.round` tick. The host increments it after every submit.
  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    setPicked(null);
    const next = randInt(0, spec.choices - 1);
    setAnswer(next);
    api.setPrompt(`Tap tile ${next + 1}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const choose = useCallback(
    (index: number) => {
      if (answered.current) return;
      answered.current = true;
      setPicked(index);

      const correct = index === answer;
      api.haptic(correct ? 'success' : 'error');
      // `submit` is the only call that matters: the host does the rest.
      api.submit(correct, { delayMs: correct ? 400 : 900 });
    },
    [answer, api],
  );

  return (
    <Board>
      {({ width }) => (
        <View style={[styles.grid, { width }]}>
          {Array.from({ length: spec.choices }, (_, index) => (
            <PressableScale
              key={index}
              accessibilityRole="button"
              onPress={() => choose(index)}
              style={[
                styles.tile,
                {
                  backgroundColor:
                    picked === null
                      ? theme.colors.surface
                      : index === answer
                        ? theme.colors.success
                        : index === picked
                          ? theme.colors.danger
                          : theme.colors.surface,
                  borderColor: alpha(accent, 0.4),
                },
              ]}
            >
              <Text style={[styles.label, { color: theme.colors.text }]}>{index + 1}</Text>
            </PressableScale>
          ))}
        </View>
      )}
    </Board>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  tile: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 28, fontWeight: '800' },
});

export const templateGame: GameDefinition = {
  // Never change a published id — saved scores are keyed on it.
  id: 'template-game',
  title: 'Template Game',
  tagline: 'Copy me to start a new game',
  category: 'logic',
  accent: 'blue',
  glyph: '🧪',
  howToPlay: ['Describe the goal.', 'Describe the controls.', 'Describe how it gets harder.'],
  // 'lives' for round-based games, or { mode: 'timed', seconds: 60, lives: 3 }.
  session: { mode: 'lives', lives: 3 },
  // levelUpEvery: 1 raises the level after every success; null keeps it fixed.
  progression: { levelUpEvery: 1 },
  // Optional shot clock. The host draws the bar and fails the round on expiry.
  // roundLimitMs: (level) => clamp(3400 - level * 250, 1400, 3400),
  pointsPerRound: (level) => 10 * level,
  component: TemplateGame,
};
