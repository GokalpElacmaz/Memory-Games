import type { GameDefinition } from '@/engine/types';

import { blackKeys } from './black-keys';
import { colorMatch } from './color-match';
import { colourChain } from './colour-chain';
import { higherSide } from './higher-side';
import { memoryGrid } from './memory-grid';
import { memoryHex } from './memory-hex';
import { oneAndOnly } from './one-and-only';
import { planes } from './planes';
import { rotatingGrid } from './rotating-grid';
import { sameAgain } from './same-again';
import { symbolSequence } from './symbol-sequence';
import { whatsNew } from './whats-new';
import { whoIsNew } from './who-is-new';

/**
 * The one place the app learns about a game.
 *
 * To add another: create `src/games/<your-game>/index.tsx`, export a
 * `GameDefinition`, then import it and drop it in this array. The home screen,
 * routing, scoring, records and settings all pick it up automatically.
 */
export const GAMES: GameDefinition[] = [
  memoryGrid,
  rotatingGrid,
  memoryHex,
  whatsNew,
  whoIsNew,
  symbolSequence,
  planes,
  colorMatch,
  sameAgain,
  oneAndOnly,
  colourChain,
  higherSide,
  blackKeys,
];

const byId = new Map(GAMES.map((game) => [game.id, game]));

export function getGame(id: string | undefined): GameDefinition | undefined {
  return id ? byId.get(id) : undefined;
}
