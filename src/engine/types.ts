import type { ComponentType } from 'react';

import type { AccentName } from '@/theme/palette';

export type GameCategory = 'memory' | 'attention' | 'logic' | 'speed';

export const categoryLabels: Record<GameCategory, string> = {
  memory: 'Memory',
  attention: 'Attention',
  logic: 'Logic',
  speed: 'Speed',
};

/**
 * How a run ends.
 *  - `lives`  : discrete rounds; a mistake costs a life, run ends at zero.
 *  - `timed`  : a countdown drives the run; mistakes may also cost lives.
 */
export type SessionRules =
  | { mode: 'lives'; lives: number }
  | { mode: 'timed'; seconds: number; lives?: number };

export type Progression = {
  /**
   * Successes needed before `level` increases. 1 = every round (the default for
   * memorise-style games). `null` keeps the level fixed for the whole run,
   * which suits reaction games that ramp difficulty by their own clock.
   */
  levelUpEvery: number | null;
  /** Level the run starts on. */
  startLevel?: number;
};

/** What the host hands to a game component. Games render, the host scores. */
export type GameApi = {
  /** Current difficulty level, 1-based. */
  level: number;
  /** Monotonic round counter — use it as an effect dependency to build a round. */
  round: number;
  score: number;
  lives: number;
  maxLives: number;
  /** Consecutive successes. */
  streak: number;
  /** Seconds left in `timed` mode, otherwise null. */
  timeLeft: number | null;
  /** False while the intro countdown runs or after the run has ended. */
  isRunning: boolean;
  /** Extra milliseconds the player asked for in Settings on memorise phases. */
  memoriseBonusMs: number;
  /** This round's shot clock in ms, or null when the game has no per-round limit. */
  roundLimitMs: number | null;

  /** Report the outcome of one round. The host scores it and bumps `round`. */
  submit: (success: boolean, options?: SubmitOptions) => void;
  /** Score without ending a round — for partial progress inside a round. */
  addScore: (points: number) => void;
  /** End the run immediately (e.g. the player ran out of moves). */
  endRun: () => void;
  /** One-line instruction shown in the HUD; safe to call from an effect. */
  setPrompt: (text: string | null) => void;
  /** Short vibration; a no-op when the player disabled haptics. */
  haptic: (kind?: 'light' | 'medium' | 'success' | 'error') => void;
};

export type SubmitOptions = {
  /** Overrides the default points for a successful round. */
  points?: number;
  /** Skip the life penalty for this failure (used for soft mistakes). */
  free?: boolean;
  /** Delay in ms before the next round starts, so feedback stays visible. */
  delayMs?: number;
};

export type GameComponentProps = { api: GameApi };

/**
 * A game is one object. Drop a folder under `src/games/`, export a definition,
 * register it in `src/games/index.ts` — nothing else in the app needs to change.
 */
export type GameDefinition = {
  /** Stable id: it keys saved progress, so never rename a published one. */
  id: string;
  title: string;
  /** One line shown on the home card. */
  tagline: string;
  category: GameCategory;
  accent: AccentName;
  /** Emoji shown on the home card and the intro screen. */
  glyph: string;
  /** Draw the game behind a shaded HUD so the playfield uses the full run screen. */
  immersive?: boolean;
  /** Bullet points for the "How to play" intro. */
  howToPlay: string[];
  session: SessionRules;
  progression: Progression;
  /** Points awarded for a successful round when `submit` gets no override. */
  pointsPerRound?: number | ((level: number) => number);
  /**
   * Time the player gets to answer a single round. When it runs out the host
   * submits a failure for them and the HUD shows a draining bar. Leave it off
   * for memorise-style games, where the player should be able to think.
   */
  roundLimitMs?: number | ((level: number) => number);
  component: ComponentType<GameComponentProps>;
};
