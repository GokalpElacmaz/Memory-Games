/** Pure board rules for Colour Chain — no React, so they can be reasoned about
 * (and exercised) on their own. */

export const COLS = 7;
export const ROWS = 9;
export const CELLS = COLS * ROWS;

/** Chains pay 2^n, so length is worth far more than volume. */
export const scoreFor = (length: number) => 2 ** length;

export const rowOf = (index: number) => Math.floor(index / COLS);
export const colOf = (index: number) => index % COLS;

export function areAdjacent(a: number, b: number): boolean {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

/**
 * Slides one row sideways, Pac-Man style: whatever leaves one end reappears at
 * the other. Only this row moves, so sliding genuinely rearranges which squares
 * touch which — that is how you line a colour up.
 */
export function shiftRow(board: number[], row: number, dir: 'left' | 'right'): number[] {
  const next = board.slice();
  for (let col = 0; col < COLS; col++) {
    const from = dir === 'right' ? (col - 1 + COLS) % COLS : (col + 1) % COLS;
    next[row * COLS + col] = board[row * COLS + from];
  }
  return next;
}

/** The same for a single column, wrapping top to bottom. */
export function shiftCol(board: number[], col: number, dir: 'up' | 'down'): number[] {
  const next = board.slice();
  for (let row = 0; row < ROWS; row++) {
    const from = dir === 'down' ? (row - 1 + ROWS) % ROWS : (row + 1) % ROWS;
    next[row * COLS + col] = board[from * COLS + col];
  }
  return next;
}

/**
 * Clears `doomed`, drops everything above into the holes and refills the top
 * with fresh colours — the board never runs dry.
 */
export function collapse(
  board: number[],
  doomed: Set<number>,
  refill: () => number,
): number[] {
  const next = board.slice();

  for (let col = 0; col < COLS; col++) {
    // Survivors bottom-up, then written back bottom-up: everything above a
    // cleared cell falls by exactly the number of holes beneath it.
    const survivors: number[] = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const index = row * COLS + col;
      if (!doomed.has(index)) survivors.push(next[index]);
    }
    for (let row = ROWS - 1, s = 0; row >= 0; row--, s++) {
      next[row * COLS + col] = s < survivors.length ? survivors[s] : refill();
    }
  }

  return next;
}
