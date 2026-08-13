import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSettings } from '@/storage/settings';

import type { GameApi, GameDefinition, SubmitOptions } from './types';

/**
 * `idle` covers the how-to-play screen: no clock runs and nothing can be
 * recorded until the player actually presses Start.
 */
export type RunPhase = 'idle' | 'countdown' | 'playing' | 'over';

export type RunSnapshot = {
  phase: RunPhase;
  level: number;
  round: number;
  score: number;
  lives: number;
  maxLives: number;
  streak: number;
  timeLeft: number | null;
  prompt: string | null;
  /** 3, 2, 1 during the pre-run countdown. */
  countdown: number;
  /** Set when the run ends, so the results overlay can explain why. */
  endReason: 'lives' | 'time' | 'quit' | null;
};

export type RunOutcome = { score: number; level: number; reason: NonNullable<RunSnapshot['endReason']> };

const COUNTDOWN_FROM = 3;

function pointsFor(def: GameDefinition, level: number): number {
  const p = def.pointsPerRound;
  if (typeof p === 'function') return p(level);
  if (typeof p === 'number') return p;
  return 10 * level;
}

function resolveRoundLimit(def: GameDefinition, level: number): number | null {
  const limit = def.roundLimitMs;
  if (typeof limit === 'function') return limit(level);
  return limit ?? null;
}

/**
 * Owns everything that is the same for every game: countdown, lives, timer,
 * score, level progression and run termination. Game components only decide
 * whether a round was a success.
 */
export function useGameSession(def: GameDefinition, onFinished: (outcome: RunOutcome) => void) {
  const { settings } = useSettings();
  const maxLives = def.session.mode === 'lives' ? def.session.lives : (def.session.lives ?? 0);
  const startLevel = def.progression.startLevel ?? 1;

  const [state, setState] = useState<RunSnapshot>(() => ({
    phase: 'idle',
    level: startLevel,
    round: 0,
    score: 0,
    lives: maxLives,
    maxLives,
    streak: 0,
    timeLeft: def.session.mode === 'timed' ? def.session.seconds : null,
    prompt: null,
    countdown: COUNTDOWN_FROM,
    endReason: null,
  }));

  const roundLimitMs = resolveRoundLimit(def, state.level);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const successes = useRef(0);
  const finished = useRef(false);
  // One outcome per round, whoever gets there first — the player or the clock.
  const roundAnswered = useRef(false);
  // Read inside callbacks that must not re-create themselves on every change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finish = useCallback(
    (reason: NonNullable<RunSnapshot['endReason']>) => {
      if (finished.current || stateRef.current.phase === 'idle') return;
      finished.current = true;
      clearTimers();
      const snap = stateRef.current;
      setState((prev) => ({ ...prev, phase: 'over', endReason: reason }));
      onFinishedRef.current({ score: snap.score, level: snap.level, reason });
    },
    [clearTimers],
  );

  // Pre-run countdown.
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const id = setTimeout(() => {
      setState((prev) => {
        if (prev.phase !== 'countdown') return prev;
        if (prev.countdown > 1) return { ...prev, countdown: prev.countdown - 1 };
        return { ...prev, phase: 'playing', countdown: 0, round: 1 };
      });
    }, 700);
    return () => clearTimeout(id);
  }, [state.phase, state.countdown]);

  // Countdown clock for timed games.
  useEffect(() => {
    if (state.phase !== 'playing' || def.session.mode !== 'timed') return;
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'playing' || prev.timeLeft === null) return prev;
        return { ...prev, timeLeft: Math.max(0, prev.timeLeft - 1) };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.phase, def.session.mode]);

  useEffect(() => {
    if (state.phase === 'playing' && state.timeLeft === 0) finish('time');
  }, [state.phase, state.timeLeft, finish]);

  const haptic = useCallback(
    (kind: 'light' | 'medium' | 'success' | 'error' = 'light') => {
      if (!settings.haptics) return;
      if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      else if (kind === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [settings.haptics],
  );

  const submit = useCallback(
    (success: boolean, options: SubmitOptions = {}) => {
      const snap = stateRef.current;
      if (snap.phase !== 'playing' || roundAnswered.current) return;
      roundAnswered.current = true;
      const { levelUpEvery } = def.progression;

      // Derived up front, not inside the updater, so the delayed follow-up below
      // and any double-invoked updater agree on the same numbers.
      const costsLife = !success && !options.free && snap.maxLives > 0;
      const livesAfter = costsLife ? snap.lives - 1 : snap.lives;
      if (success) successes.current += 1;
      const levelUp =
        success && levelUpEvery !== null && successes.current % levelUpEvery === 0;

      setState((prev) => {
        if (prev.phase !== 'playing') return prev;
        if (success) {
          return {
            ...prev,
            score: prev.score + (options.points ?? pointsFor(def, prev.level)),
            streak: prev.streak + 1,
          };
        }
        return { ...prev, streak: 0, lives: livesAfter };
      });

      const delay = options.delayMs ?? 0;
      later(() => {
        if (livesAfter <= 0 && stateRef.current.maxLives > 0) {
          finish('lives');
          return;
        }
        // Level moves with the round, never before it: a game reading api.level
        // must not re-render the round it is still showing feedback for.
        setState((prev) =>
          prev.phase === 'playing'
            ? { ...prev, round: prev.round + 1, level: levelUp ? prev.level + 1 : prev.level }
            : prev,
        );
      }, delay);
    },
    [def, later, finish],
  );

  // A fresh round can be answered again.
  useEffect(() => {
    roundAnswered.current = false;
  }, [state.round]);

  // Per-round shot clock. Running out counts as a failed round.
  useEffect(() => {
    if (state.phase !== 'playing' || !roundLimitMs || !state.round) return;
    const id = setTimeout(() => {
      if (roundAnswered.current) return;
      submit(false, { delayMs: 700 });
    }, roundLimitMs);
    return () => clearTimeout(id);
  }, [state.phase, state.round, roundLimitMs, submit]);

  const addScore = useCallback((points: number) => {
    setState((prev) => (prev.phase === 'playing' ? { ...prev, score: prev.score + points } : prev));
  }, []);

  const setPrompt = useCallback((text: string | null) => {
    setState((prev) => (prev.prompt === text ? prev : { ...prev, prompt: text }));
  }, []);

  const endRun = useCallback(() => finish('quit'), [finish]);

  const restart = useCallback(() => {
    clearTimers();
    finished.current = false;
    successes.current = 0;
    setState({
      phase: 'countdown',
      level: startLevel,
      round: 0,
      score: 0,
      lives: maxLives,
      maxLives,
      streak: 0,
      timeLeft: def.session.mode === 'timed' ? def.session.seconds : null,
      prompt: null,
      countdown: COUNTDOWN_FROM,
      endReason: null,
    });
  }, [clearTimers, def.session, maxLives, startLevel]);

  const api = useMemo<GameApi>(
    () => ({
      level: state.level,
      round: state.round,
      score: state.score,
      lives: state.lives,
      maxLives: state.maxLives,
      streak: state.streak,
      timeLeft: state.timeLeft,
      isRunning: state.phase === 'playing',
      memoriseBonusMs: settings.extraMemoriseTime * 1000,
      roundLimitMs,
      submit,
      addScore,
      endRun,
      setPrompt,
      haptic,
    }),
    [state, settings.extraMemoriseTime, roundLimitMs, submit, addScore, endRun, setPrompt, haptic],
  );

  return { api, state, restart };
}
