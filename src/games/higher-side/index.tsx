/**
 * Ported from the KelMat web project's math game. The candidate-building and
 * pairing logic is kept faithful — it is what makes the two sides land close
 * enough together to be a real decision. The shell is rebuilt for touch: you
 * tap a side instead of hovering it, and the host owns the clock and lives.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { clamp, shuffle } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

type Side = 'left' | 'right';

type Op =
  | { kind: 'add'; k: number }
  | { kind: 'sub'; k: number }
  | { kind: 'mul'; k: number }
  | { kind: 'div'; k: number; mode?: 'floor' }
  | { kind: 'square' }
  | { kind: 'sqrt'; mode?: 'ceil' };

function opToText(op: Op): string {
  switch (op.kind) {
    case 'add':
      return `+${op.k}`;
    case 'sub':
      return `−${op.k}`;
    case 'mul':
      return `×${op.k}`;
    case 'div':
      return `÷${op.k}`;
    case 'square':
      return 'x²';
    case 'sqrt':
      return '√x';
  }
}

function isPerfectSquare(n: number): boolean {
  const r = Math.floor(Math.sqrt(n));
  return r * r === n;
}

function applyOp(v: number, op: Op): number | null {
  switch (op.kind) {
    case 'add':
      return v + op.k;
    case 'sub':
      return v - op.k;
    case 'mul':
      return v * op.k;
    case 'div': {
      if (op.k === 0) return null;
      if (op.mode === 'floor') return Math.floor(v / op.k);
      if (v % op.k !== 0) return null;
      return v / op.k;
    }
    case 'square':
      return v * v;
    case 'sqrt': {
      const r = Math.sqrt(v);
      if (!Number.isFinite(r)) return null;
      if (op.mode === 'ceil') return Math.ceil(r);
      if (!isPerfectSquare(v)) return null;
      return r;
    }
  }
}

/** Snap an offset to a readable increment for its magnitude. */
function roundToNice(n: number): number {
  const a = Math.abs(n);
  const step = a < 25 ? 1 : a < 80 ? 5 : a < 250 ? 10 : a < 800 ? 20 : a < 2000 ? 50 : 100;
  return Math.round(n / step) * step;
}

function jitterSet(v: number): number[] {
  const step = clamp(Math.round(v * 0.02), 5, 35);
  return [-2 * step, -step, 0, step, 2 * step];
}

type Candidate = { op: Op; r: number };

function buildUpCandidates(v: number): Candidate[] {
  const out: Candidate[] = [];

  const multKs = v < 100 ? [2, 3, 4, 5, 6, 7, 8, 9] : [2, 3, 4, 5];
  for (const k of multKs) out.push({ op: { kind: 'mul', k }, r: v * k });
  if (v < 50) out.push({ op: { kind: 'square' }, r: v * v });

  const adds: Candidate[] = [];
  for (const c of out) {
    for (const j of jitterSet(v)) {
      const k = roundToNice(c.r - v + j);
      if (k <= 0) continue;
      adds.push({ op: { kind: 'add', k }, r: v + k });
    }
  }

  return [...out, ...adds];
}

function buildDownCandidates(v: number): Candidate[] {
  const out: Candidate[] = [];

  for (const k of [2, 3, 4, 5]) {
    out.push({ op: { kind: 'div', k, mode: 'floor' }, r: Math.floor(v / k) });
  }
  if (v >= 100) out.push({ op: { kind: 'sqrt', mode: 'ceil' }, r: Math.ceil(Math.sqrt(v)) });

  const subs: Candidate[] = [];
  for (const c of out) {
    for (const j of jitterSet(v)) {
      const k = roundToNice(v - c.r + j);
      if (k <= 0) continue;
      const r = v - k;
      if (r <= 0) continue;
      subs.push({ op: { kind: 'sub', k }, r });
    }
  }

  return [...out, ...subs];
}

const isScale = (op: Op) =>
  op.kind === 'mul' || op.kind === 'div' || op.kind === 'square' || op.kind === 'sqrt';
const isLinear = (op: Op) => op.kind === 'add' || op.kind === 'sub';

function scaleBonus(op: Op): number {
  if (op.kind === 'mul') return op.k * 0.02;
  if (op.kind === 'div') return op.k * 0.03;
  if (op.kind === 'square') return 0.22;
  if (op.kind === 'sqrt') return 0.18;
  return 0;
}

/**
 * Always pits a scaling operation against a linear one, and only accepts a pair
 * whose results are close — that is what stops the answer being obvious.
 */
function pickTwoOps(v: number, score: number): { left: Op; right: Op } {
  const want = v > 120 ? 'down' : v < 60 ? 'up' : score % 2 === 0 ? 'up' : 'down';
  const raw = want === 'up' ? buildUpCandidates(v) : buildDownCandidates(v);

  const cap = want === 'up' ? clamp(600 + score * 35, 600, 2200) : v;
  const minAbsDiff = clamp(Math.round(v * 0.015), 2, 25);

  const candidates = shuffle(
    raw.filter((c) => {
      if (!Number.isFinite(c.r) || c.r <= 0) return false;
      if (want === 'up') return c.r > v && c.r <= cap;
      return c.r < v;
    }),
  );

  const maxRel = want === 'up' ? 0.18 : 0.22;
  const maxAbs = clamp(Math.round(v * 0.08), 8, 90);

  let best: { a: Candidate; b: Candidate; q: number } | null = null;
  const n = Math.min(220, candidates.length);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = candidates[i];
      const b = candidates[j];

      if (isScale(a.op) === isScale(b.op)) continue;
      if (isLinear(a.op) === isLinear(b.op)) continue;
      if (
        (a.op.kind === 'square' && b.op.kind === 'sqrt') ||
        (a.op.kind === 'sqrt' && b.op.kind === 'square')
      ) {
        continue;
      }

      const absDiff = Math.abs(a.r - b.r);
      if (absDiff < minAbsDiff || absDiff > maxAbs) continue;

      const relDiff = absDiff / Math.max(1, Math.max(a.r, b.r));
      if (relDiff < 0.04 || relDiff > maxRel) continue;

      const q = 1 / (1 + absDiff) + relDiff + scaleBonus(a.op) + scaleBonus(b.op);
      if (!best || q > best.q) best = { a, b, q };
    }
  }

  if (!best) {
    const a = candidates.find((c) => isScale(c.op)) ?? candidates[0];
    const b =
      candidates.find((c) => isLinear(c.op) && Math.abs(c.r - a.r) >= minAbsDiff) ??
      candidates.find((c) => isLinear(c.op)) ??
      candidates[1] ??
      candidates[0];
    best = { a, b, q: 0 };
  }

  return Math.random() < 0.5
    ? { left: best.a.op, right: best.b.op }
    : { left: best.b.op, right: best.a.op };
}

/** The original's clock: a slow start tightening towards half a second. */
function roundTimeMs(score: number): number {
  return Math.max(0.9, 5.5 * Math.pow(0.988, score)) * 1000;
}

/**
 * Everything about a finished round, frozen at the moment it was answered.
 * The verdict must never be recomputed from live state: the running total
 * changes the instant you answer, and re-deriving the winning side against the
 * new total flipped the colours so a correct answer was painted as a mistake.
 */
type Outcome = {
  chosen: Side | null;
  winner: Side;
  left: number | null;
  right: number | null;
  correct: boolean;
};

function HigherSide({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('cyan');

  // The running total survives between rounds — that is the whole game.
  const [value, setValue] = useState(1);
  const [ops, setOps] = useState(() => pickTwoOps(1, 0));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const answered = useRef(false);
  // Applied when the next round starts, so the board stays still during reveal.
  const pendingValue = useRef<number | null>(null);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    setOutcome(null);

    const base = pendingValue.current ?? valueRef.current;
    pendingValue.current = null;
    setValue(base);
    const nextOps = pickTwoOps(Math.max(1, Math.floor(base)), api.round - 1);
    setOps(nextOps);
    api.setPrompt('Which side leaves you higher?');

    // Mirrors the host's shot clock so a timeout shows the answer too.
    const limit = api.roundLimitMs;
    if (limit) {
      missTimer.current = setTimeout(() => {
        if (answered.current) return;
        answered.current = true;
        const left = applyOp(base, nextOps.left);
        const right = applyOp(base, nextOps.right);
        const winner: Side = (left ?? -Infinity) >= (right ?? -Infinity) ? 'left' : 'right';
        setOutcome({ chosen: null, winner, left, right, correct: false });
        api.setPrompt('Too slow');
      }, limit);
    }

    return () => {
      if (missTimer.current) clearTimeout(missTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const choose = useCallback(
    (side: Side) => {
      if (answered.current || !api.isRunning) return;
      answered.current = true;
      if (missTimer.current) clearTimeout(missTimer.current);

      // Read once, from this round's own numbers.
      const base = valueRef.current;
      const current = opsRef.current;
      const left = applyOp(base, current.left);
      const right = applyOp(base, current.right);
      const best = Math.max(left ?? -Infinity, right ?? -Infinity);
      const picked = side === 'left' ? left : right;
      // Comparing against the best result rather than a single "winning side"
      // means a tie counts for either side instead of punishing one of them.
      const correct = (picked ?? -Infinity) === best;
      const winner: Side = (left ?? -Infinity) >= (right ?? -Infinity) ? 'left' : 'right';

      if (correct) {
        pendingValue.current = picked && picked > 0 ? Math.floor(picked) : 1;
        api.setPrompt(`${base} → ${pendingValue.current}`);
      } else {
        api.setPrompt(`The other side gave ${side === 'left' ? right : left}`);
      }

      setOutcome({ chosen: side, winner, left, right, correct });
      api.haptic(correct ? 'success' : 'error');
      api.submit(correct, { delayMs: correct ? 420 : 900 });
    },
    [api],
  );

  const sideStyle = (side: Side) => {
    if (!outcome) return { backgroundColor: theme.colors.surface, borderColor: 'transparent' };
    // Green marks the best side; red only ever marks a side you actually chose.
    const isBest = side === outcome.winner;
    const isMistake = side === outcome.chosen && !outcome.correct;
    return {
      backgroundColor: isBest
        ? alpha(theme.colors.success, 0.22)
        : isMistake
          ? alpha(theme.colors.danger, 0.22)
          : theme.colors.surface,
      borderColor: isBest
        ? theme.colors.success
        : isMistake
          ? theme.colors.danger
          : 'transparent',
    };
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.currentBlock}>
        <Text style={[styles.currentLabel, { color: theme.colors.textFaint }]}>CURRENT</Text>
        <Text style={[styles.current, { color: accent }]}>{value}</Text>
      </View>

      <View style={styles.sides}>
        {(['left', 'right'] as const).map((side) => (
          <PressableScale
            key={side}
            accessibilityRole="button"
            accessibilityLabel={`${side} option ${opToText(side === 'left' ? ops.left : ops.right)}`}
            disabled={outcome !== null}
            onPress={() => choose(side)}
            scaleTo={0.97}
            style={[styles.side, sideStyle(side)]}
          >
            <Text style={[styles.op, { color: theme.colors.text }]}>
              {opToText(side === 'left' ? ops.left : ops.right)}
            </Text>
            {outcome && (
              <Text style={[styles.result, { color: theme.colors.textMuted }]}>
                {side === 'left' ? outcome.left : outcome.right}
              </Text>
            )}
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 16 },
  currentBlock: { alignItems: 'center', paddingTop: 8, gap: 2 },
  currentLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  current: { fontSize: 64, fontWeight: '900', fontVariant: ['tabular-nums'] },
  sides: { flex: 1, flexDirection: 'row', gap: 12 },
  side: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  op: { fontSize: 46, fontWeight: '900' },
  result: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export const higherSide: GameDefinition = {
  id: 'higher-side',
  title: 'Higher Side',
  tagline: 'Pick the operation that leaves you bigger',
  category: 'logic',
  accent: 'cyan',
  glyph: '🧮',
  howToPlay: [
    'One running number, two operations — tap the side that makes it bigger.',
    'A scaling move always faces a plain one, and the two land close together.',
    'Your answer becomes the new number, and the clock tightens as you go.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  roundLimitMs: (level) => roundTimeMs(level - 1),
  pointsPerRound: (level) => 10 * level,
  component: HigherSide,
};
