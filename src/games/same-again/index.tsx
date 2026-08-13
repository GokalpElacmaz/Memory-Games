import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing as EasingRN, Platform, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { Shape, shapeKinds, type ShapeKind } from '@/components/Shape';
import { clamp, pick, sample } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { accents } from '@/theme/palette';
import { alpha, useTheme } from '@/theme/theme';

/** Well-separated hues, so telling two apart is never a perception test. */
const PAINTS = [accents.rose, accents.amber, accents.emerald, accents.blue, accents.violet];

type Card = { kind: ShapeKind; color: string };

const sameCard = (a: Card, b: Card) => a.kind === b.kind && a.color === b.color;

/** How long the opening card sits on screen before the first comparison. */
const SEED_MS = 900;
const EXIT_MS = 190;
const ENTER_MS = 240;
/** Old card out, then new card in — the whole hand-over. */
const DEAL_MS = EXIT_MS + ENTER_MS;
/** react-native-web has no native driver; everywhere else it is free. */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function levelSpec(level: number) {
  return {
    kinds: clamp(2 + Math.floor((level - 1) / 2), 2, shapeKinds.length),
    colors: clamp(2 + Math.floor((level - 1) / 3), 2, PAINTS.length),
  };
}

function randomCard(level: number): Card {
  const spec = levelSpec(level);
  return {
    kind: pick(sample(shapeKinds, spec.kinds)),
    color: pick(sample(PAINTS, spec.colors)),
  };
}

/**
 * Half the time the card repeats exactly. Otherwise it changes shape, colour or
 * both — so neither attribute alone is enough to answer with.
 */
function nextCard(previous: Card, level: number): Card {
  if (Math.random() < 0.5) return previous;

  const spec = levelSpec(level);
  const kinds = sample(shapeKinds, spec.kinds);
  const colors = sample(PAINTS, spec.colors);
  const change = pick(['kind', 'color', 'both'] as const);

  const kind =
    change === 'color'
      ? previous.kind
      : (pick(kinds.filter((k) => k !== previous.kind)) ?? previous.kind);
  const color =
    change === 'kind'
      ? previous.color
      : (pick(colors.filter((c) => c !== previous.color)) ?? previous.color);

  const candidate = { kind, color };
  // The pools can be too small to honour the requested change; never let a
  // "different" card come back identical.
  return sameCard(candidate, previous) ? nextCard(previous, level) : candidate;
}

type Phase = 'seed' | 'sliding' | 'ask' | 'reveal';

function SameAgain({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('violet');

  const [shown, setShown] = useState<Card | null>(null);
  const [phase, setPhase] = useState<Phase>('seed');
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  // The card being compared against — always the one judged last round.
  const previous = useRef<Card | null>(null);
  const answered = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const track = useRef(420);

  // React Native's own Animated rather than Reanimated: the hand-over needs a
  // reliable "jump off-screen then animate back" and Reanimated's sequencing
  // and layout animations both stranded the card mid-flight on web.
  const cardX = useRef(new Animated.Value(0)).current;

  /**
   * Deals a card: the outgoing one leaves to the left and the new one arrives
   * from the right only once it has gone, so the two are never side by side.
   * The motion is identical whether or not the card changed, which is the
   * point — there is no in-place flicker to read the answer from, only memory.
   */
  const deal = useCallback(
    (card: Card, isFirst: boolean) => {
      const bringIn = () => {
        setShown(card);
        cardX.setValue(track.current);
        Animated.timing(cardX, {
          toValue: 0,
          duration: ENTER_MS,
          easing: EasingRN.out(EasingRN.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      };

      if (isFirst) {
        bringIn();
        return;
      }

      Animated.timing(cardX, {
        toValue: -track.current,
        duration: EXIT_MS,
        easing: EasingRN.in(EasingRN.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) bringIn();
      });
    },
    [cardX],
  );

  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    setVerdict(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const openQuestion = () => {
      setPhase('ask');
      api.setPrompt('Same as the one before?');
    };

    if (!previous.current) {
      // Opening card: shown on its own so there is something to compare to.
      const seed = randomCard(api.level);
      previous.current = seed;
      setPhase('seed');
      api.setPrompt('Remember this one');
      deal(seed, true);
      timers.current.push(
        setTimeout(() => {
          setPhase('sliding');
          deal(nextCard(seed, api.level), false);
          timers.current.push(setTimeout(openQuestion, DEAL_MS));
        }, SEED_MS + ENTER_MS),
      );
    } else {
      setPhase('sliding');
      deal(nextCard(previous.current, api.level), false);
      // Answering only opens once the card has settled, so nobody can guess
      // from a card that is still moving.
      timers.current.push(setTimeout(openQuestion, DEAL_MS));
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const answer = useCallback(
    (saidSame: boolean) => {
      if (phase !== 'ask' || answered.current || !shown || !previous.current) return;
      answered.current = true;

      const correct = saidSame === sameCard(shown, previous.current);
      // Whatever was just judged becomes the reference for the next round.
      previous.current = shown;
      setVerdict(correct ? 'right' : 'wrong');
      setPhase('reveal');
      api.haptic(correct ? 'success' : 'error');
      api.submit(correct, { points: 15 + api.streak * 3, delayMs: correct ? 300 : 660 });
    },
    [api, phase, shown],
  );

  const frame =
    verdict === 'right'
      ? theme.colors.success
      : verdict === 'wrong'
        ? theme.colors.danger
        : alpha(theme.colors.textFaint, 0.18);

  const canAnswer = phase === 'ask';

  return (
    <View style={styles.wrap}>
      {/* Clips the deck so a card is never half-visible at the edges. */}
      <View
        style={styles.deck}
        onLayout={(e) => {
          track.current = e.nativeEvent.layout.width + 60;
        }}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: theme.colors.bgElevated, borderColor: frame },
            { transform: [{ translateX: cardX }] },
          ]}
        >
          {shown && <Shape kind={shown.kind} size={150} color={shown.color} />}
        </Animated.View>
      </View>

      <Text style={[styles.seedNote, { color: theme.colors.textFaint }]}>
        {phase === 'seed' ? 'First card — nothing to compare yet' : ' '}
      </Text>

      <View style={styles.answers}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Different"
          disabled={!canAnswer}
          onPress={() => answer(false)}
          style={[
            styles.answer,
            {
              backgroundColor: alpha(theme.colors.danger, 0.16),
              borderColor: alpha(theme.colors.danger, 0.5),
              opacity: canAnswer ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.answerGlyph, { color: theme.colors.danger }]}>◀</Text>
          <Text style={[styles.answerLabel, { color: theme.colors.danger }]}>Different</Text>
        </PressableScale>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Same"
          disabled={!canAnswer}
          onPress={() => answer(true)}
          style={[
            styles.answer,
            {
              backgroundColor: alpha(accent, 0.16),
              borderColor: alpha(accent, 0.5),
              opacity: canAnswer ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.answerGlyph, { color: accent }]}>▶</Text>
          <Text style={[styles.answerLabel, { color: accent }]}>Same</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20 },
  deck: { flex: 1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '82%',
    aspectRatio: 0.74,
    maxHeight: '100%',
    borderRadius: 26,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedNote: { fontSize: 13, fontWeight: '600', textAlign: 'center', minHeight: 20, paddingTop: 8 },
  answers: { flexDirection: 'row', gap: 14, paddingTop: 14 },
  answer: {
    flex: 1,
    height: 92,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  answerGlyph: { fontSize: 26, fontWeight: '800' },
  answerLabel: { fontSize: 14, fontWeight: '700' },
});

export const sameAgain: GameDefinition = {
  id: 'same-again',
  title: 'Same Again',
  tagline: 'Did the shape and colour just repeat?',
  category: 'attention',
  accent: 'violet',
  glyph: '🔁',
  howToPlay: [
    'Cards deal one at a time, each with a shape in a colour.',
    'Right if the new card matches the one before it exactly — left if anything changed.',
    'Shape or colour can change on its own, so both have to be watched.',
    'Every card slides in the same way, so nothing but memory tells you it changed.',
  ],
  session: { mode: 'timed', seconds: 60, lives: 5 },
  progression: { levelUpEvery: 6 },
  // Allows for the deal animation before the clock really bites.
  roundLimitMs: (level) => clamp(3700 - level * 220, 1700, 3700),
  pointsPerRound: 15,
  component: SameAgain,
};
