/** Pure track generation and pacing for Black Keys — no React, so the rules
 * can be reasoned about (and exercised) on their own. */

export const COLUMNS = 4;
/** How many cells of track fit on screen at once. */
export const VISIBLE_CELLS = 5.5;

/** Ordinary tiles are a single cell and are simply tapped. */
export const TAP_LENGTH = 1;
/** Holders are never shorter than this — they have to be worth holding. */
export const MIN_HOLD = 2;
export const MAX_HOLD = 6;
/** Chance any given tile is a long hold note rather than a tap. */
const HOLDER_CHANCE = 0.28;
/** Chance of extending a holder by one more cell, applied repeatedly. */
const EXTEND_CHANCE = 0.35;

/**
 * Start with the first tile's leading edge at the top of the board.
 */
export const START_SCROLL = -VISIBLE_CELLS;

export type TileKind = 'tap' | 'hold';

export type Tile = {
  index: number;
  column: number;
  /** Distance from the start of the track to this tile's near edge, in cells. */
  start: number;
  length: number;
  kind: TileKind;
};

/**
 * Holder lengths start at two cells and grow by one with a fixed chance each
 * time, so the distribution decays exponentially: mostly short holders, the
 * occasional long one.
 */
export function holdLength(random: () => number = Math.random): number {
  let length = MIN_HOLD;
  while (length < MAX_HOLD && random() < EXTEND_CHANCE) length++;
  return length;
}

/**
 * Adds tiles to an existing track while preserving indices, positions and the
 * no-three-identical-lanes rule across chunk boundaries.
 */
export function extendTrack(
  existing: readonly Tile[],
  count: number,
  random: () => number = Math.random,
): Tile[] {
  const tiles = [...existing];
  const last = tiles.at(-1);
  let start = last ? last.start + last.length : 0;
  let previous = last?.column ?? -1;

  for (let added = 0; added < count; added++) {
    const index = tiles.length;
    // Never three in the same column in a row — it reads as one long tile.
    let column = Math.floor(random() * COLUMNS) % COLUMNS;
    if (index >= 2 && column === previous && tiles[index - 2]?.column === previous) {
      column = (column + 1 + Math.floor(random() * (COLUMNS - 1))) % COLUMNS;
    }

    // The opening tile is always a tap, so a run never starts on a holder.
    const hold = index > 0 && random() < HOLDER_CHANCE;
    const length = hold ? holdLength(random) : TAP_LENGTH;

    tiles.push({ index, column, start, length, kind: hold ? 'hold' : 'tap' });
    start += length;
    previous = column;
  }

  return tiles;
}

/** Tiles are laid end to end, so there is always exactly one to deal with. */
export function buildTrack(count: number, random: () => number = Math.random): Tile[] {
  return extendTrack([], count, random);
}

/**
 * Cells per second. The endless run should build gradually: reaching the old
 * 50-tile pace now takes 200 cleared tiles, and the ceiling stays playable.
 */
export function speedFor(cleared: number): number {
  return Math.min(7.2, 2.4 + cleared * 0.015);
}

/** A tile is gone once its far edge has passed the bottom of the screen. */
export const hasPassed = (tile: Tile, scroll: number) => tile.start + tile.length <= scroll;

/** Tile bounds in viewport-cell coordinates, increasing from top to bottom. */
export function tileViewportBounds(tile: Tile, scroll: number) {
  return {
    top: VISIBLE_CELLS + scroll - tile.start - tile.length,
    bottom: VISIBLE_CELLS + scroll - tile.start,
  };
}

/** A tile can be played whenever any part of it is visible on the board. */
export function isReachable(tile: Tile, scroll: number) {
  const bounds = tileViewportBounds(tile, scroll);
  return bounds.bottom >= 0 && bounds.top <= VISIBLE_CELLS && !hasPassed(tile, scroll);
}

/** The finger must land on the visible black tile, with a small touch margin. */
export function isTouchOnTile(tile: Tile, scroll: number, touchCell: number) {
  const bounds = tileViewportBounds(tile, scroll);
  const margin = 0.12;
  return (
    isReachable(tile, scroll) &&
    touchCell >= Math.max(0, bounds.top) - margin &&
    touchCell <= Math.min(VISIBLE_CELLS, bounds.bottom) + margin
  );
}

/**
 * A hold starts from anywhere on its visible black body. The circle is a clear
 * visual cue, not a tiny precision target during a fast run.
 */
export function isTouchOnHolder(tile: Tile, scroll: number, touchCell: number) {
  const bounds = tileViewportBounds(tile, scroll);
  const margin = 0.18;
  return (
    isReachable(tile, scroll) &&
    touchCell >= Math.max(0, bounds.top) - margin &&
    touchCell <= Math.min(VISIBLE_CELLS, bounds.bottom) + margin
  );
}

/**
 * Forgive the final 40% of a holder, capped at 1.2 track cells. The player
 * still has to establish a real hold, but lifting naturally is rarely punished.
 */
export const releaseGrace = (tile: Tile) => Math.min(1.2, tile.length * 0.4);

/** Distance that must actually be held; shared by rules and visual progress. */
export const requiredHoldDistance = (tile: Tile) => tile.length - releaseGrace(tile);

export const canRelease = (tile: Tile, grabbedAt: number, scroll: number) =>
  scroll - grabbedAt + 1e-6 >= requiredHoldDistance(tile);

/**
 * How far a hold has come along, from the instant it was grabbed, as a
 * fraction.
 *
 * Visual progress reaches 100% at the already-established forgiving release
 * threshold. This removes the old partial-fill jump without changing when a
 * hold succeeds or how much release grace the player gets.
 */
export function holdProgress(
  tile: Tile,
  grabbedAt: number,
  scroll: number,
): number {
  const travelled = scroll - grabbedAt;
  const required = requiredHoldDistance(tile);
  if (travelled + 1e-6 >= required) return 1;
  return Math.max(0, travelled / required);
}
