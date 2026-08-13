import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { clamp, pick, pickOther, randInt } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { useTheme } from '@/theme/theme';

type Direction = 'up' | 'down' | 'left' | 'right';

const TRAVEL: Direction[] = ['up', 'down', 'left', 'right'];

/** Sprite rotation, degrees clockwise from "nose up". Cardinal only. */
const TRAVEL_ANGLE: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };

/**
 * The livery decides which question you are answering:
 *  - orange asks where the squadron is going
 *  - blue asks where it is pointing
 * Nose and course never agree, so the colour is the whole task.
 */
type Livery = 'orange' | 'blue';

/** How many planes cross together. They fill the axis across the course. */
const SQUADRON = 7;
/** A swipe has to travel this far before it counts as an answer. */
const SWIPE_MIN = 34;

/**
 * The slowest plane's crossing time is the round's limit — once the squadron
 * has left the frame the answer is gone.
 */
export function flightDuration(level: number): number {
  return clamp(3200 - level * 260, 1100, 3200);
}

type Plane = {
  id: number;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
};

type Sortie = {
  travel: Direction;
  /** Where every nose points — one of the four answers, never `travel`. */
  nose: Direction;
  livery: Livery;
  answer: Direction;
  planes: Plane[];
};

/**
 * One squadron per round: a single livery, a single course and a single
 * heading, differing only in size and speed. Reading any one of them answers
 * the round — the flock is there to crowd the sky, not to mislead.
 */
function planSortie(limitMs: number, width: number, height: number): Sortie {
  const travel = pick(TRAVEL);
  const nose = pickOther(TRAVEL, travel);
  const livery = pick<Livery>(['orange', 'blue']);
  const answer = livery === 'orange' ? travel : nose;

  const horizontal = travel === 'left' || travel === 'right';
  // Lanes run across the course, so a horizontal pass fills the height and a
  // vertical pass fills the width.
  const span = horizontal ? height : width;
  const laneSize = span / SQUADRON;

  const planes = Array.from({ length: SQUADRON }, (_, i) => {
    const size = randInt(36, 74);
    const lane = laneSize * i + laneSize / 2 + randInt(-8, 8);
    const margin = size + 12;
    // Every plane clears the frame within the round limit; the slowest uses all
    // of it, so the shot clock and the last exit are the same moment.
    const duration = Math.round(limitMs * (0.55 + Math.random() * 0.45));

    const path: Record<Direction, { from: { x: number; y: number }; to: { x: number; y: number } }> =
      {
        right: { from: { x: -margin, y: lane }, to: { x: width + margin, y: lane } },
        left: { from: { x: width + margin, y: lane }, to: { x: -margin, y: lane } },
        down: { from: { x: lane, y: -margin }, to: { x: lane, y: height + margin } },
        up: { from: { x: lane, y: height + margin }, to: { x: lane, y: -margin } },
      };

    return { id: i, size, duration, ...path[travel] };
  });

  return { travel, nose, livery, answer, planes };
}

function PaperPlane({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polygon points="50,4 6,94 50,72" fill={color} opacity={0.75} />
      <Polygon points="50,4 94,94 50,72" fill={color} />
    </Svg>
  );
}

function FlyingPlane({
  plane,
  angle,
  color,
  hidden,
}: {
  plane: Plane;
  angle: number;
  color: string;
  hidden: boolean;
}) {
  const x = useSharedValue(plane.from.x);
  const y = useSharedValue(plane.from.y);

  useEffect(() => {
    x.value = plane.from.x;
    y.value = plane.from.y;
    x.value = withTiming(plane.to.x, { duration: plane.duration, easing: Easing.linear });
    y.value = withTiming(plane.to.y, { duration: plane.duration, easing: Easing.linear });
  }, [plane, x, y]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - plane.size / 2 },
      { translateY: y.value - plane.size / 2 },
      { rotate: `${angle}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.plane, { width: plane.size, height: plane.size }, style, hidden && styles.gone]}
    >
      <PaperPlane size={plane.size} color={color} />
    </Animated.View>
  );
}

function Planes({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('orange');
  const blue = theme.accent('blue');

  const [sortie, setSortie] = useState<Sortie | null>(null);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | 'missed' | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const answered = useRef(false);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!api.round || stage.width === 0) return;
    answered.current = false;
    setVerdict(null);
    api.setPrompt('Swipe: orange → where they fly · blue → where they point');

    const limit = api.roundLimitMs ?? flightDuration(api.level);
    setSortie(planSortie(limit, stage.width, stage.height));

    // Visuals only — the host scores the miss when its own clock runs out.
    missTimer.current = setTimeout(() => {
      if (answered.current) return;
      setVerdict('missed');
      api.setPrompt('Too slow — they got away');
      api.haptic('error');
    }, limit);

    return () => {
      if (missTimer.current) clearTimeout(missTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round, stage.width, stage.height]);

  const answer = useCallback(
    (choice: Direction) => {
      if (!sortie || answered.current || !api.isRunning) return;
      answered.current = true;
      if (missTimer.current) clearTimeout(missTimer.current);

      const correct = choice === sortie.answer;
      setVerdict(correct ? 'right' : 'wrong');
      api.setPrompt(
        correct
          ? 'Correct'
          : sortie.livery === 'orange'
            ? `Orange — they were flying ${sortie.travel}`
            : `Blue — they were pointing ${sortie.nose}`,
      );
      api.haptic(correct ? 'success' : 'error');
      api.submit(correct, { points: 20 + api.streak * 5, delayMs: correct ? 380 : 700 });
    },
    [api, sortie],
  );

  // Swipe anywhere in the sky; the dominant axis picks the direction.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(10)
        .onEnd((e) => {
          const { translationX: dx, translationY: dy } = e;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
          if (Math.abs(dx) > Math.abs(dy)) answer(dx > 0 ? 'right' : 'left');
          else answer(dy > 0 ? 'down' : 'up');
        }),
    [answer],
  );

  const verdictColor =
    verdict === 'right' ? theme.colors.success : verdict ? theme.colors.danger : 'transparent';
  const color = sortie?.livery === 'blue' ? blue : accent;

  return (
    <GestureDetector gesture={swipe}>
      <View
        style={[styles.sky, { borderColor: verdictColor, backgroundColor: theme.colors.bgElevated }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setStage((prev) =>
            Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
              ? prev
              : { width, height },
          );
        }}
      >
        {sortie?.planes.map((plane) => (
          <FlyingPlane
            key={`${api.round}-${plane.id}`}
            plane={plane}
            angle={TRAVEL_ANGLE[sortie.nose]}
            color={color}
            hidden={verdict !== null && verdict !== 'missed'}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sky: { flex: 1, margin: 16, borderRadius: 24, borderWidth: 2, overflow: 'hidden' },
  plane: { position: 'absolute', top: 0, left: 0 },
  gone: { opacity: 0 },
});

export const planes: GameDefinition = {
  id: 'planes',
  title: 'Planes',
  tagline: 'The colour decides which way you answer',
  category: 'attention',
  accent: 'orange',
  glyph: '🛩️',
  howToPlay: [
    'A squadron crosses the sky together — one colour, one course, one heading.',
    'Orange: swipe the way they are flying. Blue: swipe the way they are pointing.',
    'Their noses never point where they are going, so the colour decides everything.',
    'Swipe before the last one leaves the frame — letting a squadron escape costs a life.',
  ],
  // Five lives: a crossing lasting a second or two is a hard deadline, and one
  // missed sighting should not end the run.
  session: { mode: 'timed', seconds: 60, lives: 5 },
  progression: { levelUpEvery: 5 },
  roundLimitMs: (level) => flightDuration(level),
  pointsPerRound: 20,
  component: Planes,
};
