import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { PressableScale } from '@/components/Pressable';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { accents } from '@/theme/palette';
import { alpha, useTheme } from '@/theme/theme';

import {
  areAdjacent,
  CELLS,
  COLS,
  collapse,
  colOf,
  ROWS,
  rowOf,
  scoreFor,
  shiftCol,
  shiftRow,
} from './board';

const GAP = 4;
/** Width of the arrow strips flanking the board on all four sides. */
const GUTTER = 26;

/** Five well-separated hues — the board has to be scannable at a glance. */
const PAINTS = [accents.rose, accents.amber, accents.emerald, accents.blue, accents.violet];

const randomColor = () => Math.floor(Math.random() * PAINTS.length);

function ColourChain({ api }: GameComponentProps) {
  const theme = useTheme();

  const [board, setBoard] = useState<number[]>(() =>
    Array.from({ length: CELLS }, () => randomColor()),
  );
  const [path, setPath] = useState<number[]>([]);
  const [area, setArea] = useState({ width: 0, height: 0 });

  // Read inside the touch handlers, which must not re-bind on every render.
  const boardRef = useRef(board);
  boardRef.current = board;
  const pathRef = useRef(path);
  pathRef.current = path;
  const metricsRef = useRef({ cell: 0, originX: 0, originY: 0 });

  useEffect(() => {
    if (!api.round) return;
    api.setPrompt('Link one colour · arrows slide the board');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  const cellAt = useCallback((x: number, y: number): number | null => {
    const { cell, originX, originY } = metricsRef.current;
    if (cell <= 0) return null;
    const col = Math.floor((x - originX) / (cell + GAP));
    const row = Math.floor((y - originY) / (cell + GAP));
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return row * COLS + col;
  }, []);

  // Writes the ref as well as state, so a handler can act on the new path
  // within the same tick instead of waiting for the re-render.
  const applyPath = useCallback((next: number[]) => {
    pathRef.current = next;
    setPath(next);
  }, []);

  const begin = useCallback(
    (x: number, y: number) => {
      if (!api.isRunning) return;
      const index = cellAt(x, y);
      if (index === null) return;
      applyPath([index]);
      api.haptic('light');
    },
    [api, applyPath, cellAt],
  );

  /** Returns true when the square joined (or trimmed) the chain. */
  const extend = useCallback(
    (x: number, y: number): boolean => {
      const current = pathRef.current;
      if (!current.length) return false;
      const index = cellAt(x, y);
      if (index === null) return false;

      const last = current[current.length - 1];
      if (index === last) return false;

      // Retracing onto the previous square undoes the last step.
      if (current.length >= 2 && index === current[current.length - 2]) {
        applyPath(current.slice(0, -1));
        return true;
      }

      if (current.includes(index)) return false;
      if (!areAdjacent(last, index)) return false;
      if (boardRef.current[index] !== boardRef.current[current[0]]) return false;

      applyPath([...current, index]);
      api.haptic('light');
      return true;
    },
    [api, applyPath, cellAt],
  );

  const commit = useCallback(() => {
    const chain = pathRef.current;
    applyPath([]);
    if (chain.length < 2) return;

    setBoard((prev) => collapse(prev, new Set(chain), randomColor));
    api.haptic('success');
    api.setPrompt(`${chain.length} linked · +${scoreFor(chain.length)}`);
    // Each cleared chain is a "round", so the level ticks up as you keep going.
    api.submit(true, { points: scoreFor(chain.length) });
  }, [api, applyPath]);

  /**
   * Tapping builds the same chain a square at a time. Dragging across a 7×9
   * board with a thumb is fiddly, and tapping is the more forgiving way in.
   */
  const tap = useCallback(
    (x: number, y: number) => {
      if (!api.isRunning) return;
      const index = cellAt(x, y);
      if (index === null) return;
      const current = pathRef.current;

      if (!current.length) {
        applyPath([index]);
        api.haptic('light');
        return;
      }

      // Tapping the head of the chain cashes it in.
      if (index === current[current.length - 1]) {
        if (current.length >= 2) commit();
        else applyPath([]);
        return;
      }

      // Not a legal continuation: bank what is there and start somewhere new.
      if (!extend(x, y)) {
        if (current.length >= 2) commit();
        applyPath([index]);
        api.haptic('light');
      }
    },
    [api, applyPath, cellAt, commit, extend],
  );

  const slideRow = useCallback(
    (row: number, dir: 'left' | 'right') => {
      if (!api.isRunning) return;
      // A chain is drawn against the old arrangement, so sliding drops it.
      applyPath([]);
      setBoard((prev) => shiftRow(prev, row, dir));
      api.haptic('light');
    },
    [api, applyPath],
  );

  const slideCol = useCallback(
    (col: number, dir: 'up' | 'down') => {
      if (!api.isRunning) return;
      applyPath([]);
      setBoard((prev) => shiftCol(prev, col, dir));
      api.haptic('light');
    },
    [api, applyPath],
  );

  useEffect(() => {
    if (path.length >= 2) api.setPrompt(`${path.length} linked · ${scoreFor(path.length)} pts`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.length]);

  // Recomputed on every render so the touch maths matches what is drawn. The
  // gutters hold the per-row and per-column arrows on all four sides.
  const inner = { width: area.width - GUTTER * 2, height: area.height - GUTTER * 2 };
  const cell =
    inner.width > 0
      ? Math.min(
          (inner.width - GAP * (COLS - 1)) / COLS,
          (inner.height - GAP * (ROWS - 1)) / ROWS,
        )
      : 0;
  const boardWidth = cell * COLS + GAP * (COLS - 1);
  const boardHeight = cell * ROWS + GAP * (ROWS - 1);
  const originX = (area.width - boardWidth) / 2;
  const originY = (area.height - boardHeight) / 2;
  // Hit-testing happens inside the board view, whose own origin is (0, 0).
  metricsRef.current = { cell, originX: 0, originY: 0 };

  // Gesture handler rather than the RN responder system: it reports
  // view-relative coordinates consistently, which locationX does not on web.
  // Tap and drag both build the same chain; whichever wins the race handles it.
  const gesture = useMemo(() => {
    const drag = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(0)
      .shouldCancelWhenOutside(false)
      .onBegin((e) => begin(e.x, e.y))
      .onUpdate((e) => extend(e.x, e.y))
      .onEnd(() => commit());

    const press = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(12)
      .onEnd((e) => tap(e.x, e.y));

    return Gesture.Exclusive(press, drag);
  }, [begin, extend, commit, tap]);

  const arrowTint = alpha(theme.colors.textFaint, 0.75);

  return (
    <View style={styles.stage} onLayout={onLayout}>
      {cell > 0 && (
        <>
          {/* Each arrow points the way its line will travel: the one above a
              column pulls it up, the one below pushes it down. */}
          {Array.from({ length: COLS }, (_, col) => {
            const x = originX + col * (cell + GAP);
            return (
              <React.Fragment key={`col-${col}`}>
                <Arrow
                  glyph="▲"
                  tint={arrowTint}
                  label={`Slide column ${col + 1} up`}
                  onPress={() => slideCol(col, 'up')}
                  style={{ left: x, top: originY - GUTTER, width: cell, height: GUTTER }}
                />
                <Arrow
                  glyph="▼"
                  tint={arrowTint}
                  label={`Slide column ${col + 1} down`}
                  onPress={() => slideCol(col, 'down')}
                  style={{
                    left: x,
                    top: originY + boardHeight,
                    width: cell,
                    height: GUTTER,
                  }}
                />
              </React.Fragment>
            );
          })}

          {Array.from({ length: ROWS }, (_, row) => {
            const y = originY + row * (cell + GAP);
            return (
              <React.Fragment key={`row-${row}`}>
                <Arrow
                  glyph="◀"
                  tint={arrowTint}
                  label={`Slide row ${row + 1} left`}
                  onPress={() => slideRow(row, 'left')}
                  style={{ left: originX - GUTTER, top: y, width: GUTTER, height: cell }}
                />
                <Arrow
                  glyph="▶"
                  tint={arrowTint}
                  label={`Slide row ${row + 1} right`}
                  onPress={() => slideRow(row, 'right')}
                  style={{ left: originX + boardWidth, top: y, width: GUTTER, height: cell }}
                />
              </React.Fragment>
            );
          })}

          {/* Only the board itself takes the chain gesture, so the arrows in the
              gutters stay tappable. */}
          <GestureDetector gesture={gesture}>
            <View
              style={{
                position: 'absolute',
                left: originX,
                top: originY,
                width: boardWidth,
                height: boardHeight,
              }}
            >
              {board.map((paint, index) => {
                const inPath = path.includes(index);
                const dimmed = path.length > 0 && !inPath;

                return (
                  <View
                    key={index}
                    pointerEvents="none"
                    style={[
                      styles.cell,
                      {
                        left: colOf(index) * (cell + GAP),
                        top: rowOf(index) * (cell + GAP),
                        width: cell,
                        height: cell,
                        borderRadius: Math.max(6, cell * 0.24),
                        backgroundColor: PAINTS[paint],
                        opacity: dimmed ? 0.35 : 1,
                        borderWidth: inPath ? 3 : 0,
                        borderColor: theme.colors.text,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </GestureDetector>
        </>
      )}
    </View>
  );
}

function Arrow({
  glyph,
  tint,
  label,
  onPress,
  style,
}: {
  glyph: string;
  tint: string;
  label: string;
  onPress: () => void;
  style: ViewStyle;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.8}
      style={[styles.arrow, style]}
    >
      <Text style={[styles.arrowGlyph, { color: tint }]}>{glyph}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, margin: 10 },
  cell: { position: 'absolute' },
  arrow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  arrowGlyph: { fontSize: 13, fontWeight: '800' },
});

export const colourChain: GameDefinition = {
  id: 'colour-chain',
  title: 'Colour Chain',
  tagline: 'Link squares — every extra one doubles the score',
  category: 'logic',
  accent: 'emerald',
  glyph: '🔗',
  howToPlay: [
    'Build a chain across touching squares of one colour — drag, or tap them one by one.',
    'Tap the last square again (or let go of a drag) to clear the chain.',
    'Every row and column has its own arrows. Sliding wraps Pac-Man style — what leaves one edge comes back the other side.',
    'A chain of n squares scores 2ⁿ, so length is everything.',
    'Cleared squares drop away, the rest fall and new colours refill the top.',
  ],
  session: { mode: 'timed', seconds: 90 },
  progression: { levelUpEvery: 3 },
  component: ColourChain,
};
