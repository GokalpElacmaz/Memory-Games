import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

import {
  buildTrack,
  canRelease,
  COLUMNS,
  extendTrack,
  hasPassed,
  holdProgress,
  isTouchOnHolder,
  isTouchOnTile,
  speedFor,
  START_SCROLL,
  VISIBLE_CELLS,
  type Tile,
} from './track';

const INITIAL_TRACK_LENGTH = 64;
const TRACK_CHUNK_LENGTH = 64;
const TRACK_BUFFER = 16;
/** Tiles kept mounted around the cursor; the window is wider than the screen. */
const RENDER_BEHIND = 2;
const RENDER_AHEAD = 6;

/** `at` is the scroll position when the holder was grabbed — the fill measures
 * from there, so it starts moving the moment you take hold of one. */
type Held = { index: number; column: number; at: number };

function BlackKeys({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('violet');
  const holderAccent = theme.accent('cyan');

  const [tiles, setTiles] = useState(() => buildTrack(INITIAL_TRACK_LENGTH));
  const tilesRef = useRef(tiles);
  const [cursor, setCursor] = useState(0);
  const [held, setHeld] = useState<Held | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  // The scroll runs on a frame loop, not in state — re-rendering sixty times a
  // second would be pointless when only transforms change.
  const scroll = useRef(START_SCROLL);
  const cursorRef = useRef(0);
  cursorRef.current = cursor;
  const answeredRound = useRef(0);
  const heldRef = useRef<Held | null>(null);
  heldRef.current = held;
  const apiRef = useRef(api);
  apiRef.current = api;
  const cellRef = useRef(0);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  /** Height of the accent fill on the holder currently being held. */
  const fill = useRef(new Animated.Value(0)).current;
  const holdPulse = useRef(new Animated.Value(0)).current;

  const cell = area.height > 0 ? area.height / VISIBLE_CELLS : 0;
  cellRef.current = cell;
  const laneWidth = area.width > 0 ? area.width / COLUMNS : 0;

  useEffect(() => {
    if (!api.round) return;
    api.setPrompt('Tap black tiles · press and hold anywhere on long tiles');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  // Park the track at its starting offset as soon as the size is known, so the
  // opening tiles sit up the screen during the countdown instead of jumping.
  useEffect(() => {
    if (cell > 0) translateY.setValue(scroll.current * cell);
  }, [cell, translateY]);

  const advance = useCallback(
    (hit: boolean, points = 0) => {
      const current = apiRef.current;
      if (answeredRound.current === current.round) return;
      answeredRound.current = current.round;
      const nextCursor = cursorRef.current + 1;
      cursorRef.current = nextCursor;
      setCursor(nextCursor);

      if (tilesRef.current.length - nextCursor <= TRACK_BUFFER) {
        const extended = extendTrack(tilesRef.current, TRACK_CHUNK_LENGTH);
        tilesRef.current = extended;
        setTiles(extended);
      }
      fill.setValue(0);
      current.haptic(hit ? 'light' : 'error');
      current.submit(hit, hit ? { points } : undefined);

      heldRef.current = null;
      setHeld(null);
    },
    [fill],
  );

  useEffect(() => {
    if (!held) {
      holdPulse.stopAnimation();
      holdPulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(holdPulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(holdPulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [held, holdPulse]);

  // The track scrolls on its own; playing a tile never advances it. Miss one
  // and it simply goes by, costing a life and nothing else.
  useEffect(() => {
    if (!api.isRunning || cell === 0) return;

    let frame = 0;
    let last = Date.now();
    let live = true;

    const tick = () => {
      const now = Date.now();
      // Clamped so a backgrounded tab does not teleport the track forward.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      scroll.current += speedFor(cursorRef.current) * dt;
      translateY.setValue(scroll.current * cellRef.current);

      const next = tilesRef.current[cursorRef.current];
      if (next) {
        const grab = heldRef.current;
        const holding = grab?.index === next.index;
        if (holding && grab) {
          const progress = holdProgress(next, grab.at, scroll.current);
          fill.setValue(progress * next.length * cellRef.current);
          if (canRelease(next, grab.at, scroll.current)) {
            fill.setValue(next.length * cellRef.current);
            advance(true, 10 + next.length * 5);
            if (live) frame = requestAnimationFrame(tick);
            return;
          }
        }

        if (hasPassed(next, scroll.current)) {
          advance(false);
        }
      }

      if (live) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isRunning, cell === 0]);

  useEffect(
    () => () => {
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
    },
    [],
  );

  const flashWrong = useCallback((column: number) => {
    setWrong(column);
    if (wrongTimer.current) clearTimeout(wrongTimer.current);
    wrongTimer.current = setTimeout(() => setWrong(null), 180);
  }, []);

  const pressIn = useCallback(
    (column: number, event: GestureResponderEvent) => {
      const current = apiRef.current;
      if (!current.isRunning || answeredRound.current === current.round) return;

      const tile = tilesRef.current[cursorRef.current];
      if (!tile) return;
      const touchCell = event.nativeEvent.locationY / cellRef.current;

      if (tile.column !== column) {
        flashWrong(column);
        current.setPrompt('Wrong lane');
        advance(false);
        return;
      }

      if (tile.kind === 'tap') {
        if (!isTouchOnTile(tile, scroll.current, touchCell)) {
          flashWrong(column);
          current.setPrompt('Tap directly on the black tile');
          advance(false);
          return;
        }
        advance(true, 10 + current.streak * 2);
        return;
      }

      if (!isTouchOnHolder(tile, scroll.current, touchCell)) {
        flashWrong(column);
        current.setPrompt('Press anywhere on the long black tile');
        advance(false);
        return;
      }
      const grab = { index: tile.index, column, at: scroll.current };
      heldRef.current = grab;
      setHeld(grab);
      fill.setValue(0);
      current.haptic('light');
    },
    [advance, fill, flashWrong],
  );

  const pressOut = useCallback(
    (column: number) => {
      const grab = heldRef.current;
      if (!grab || grab.column !== column) return;

      const tile = tilesRef.current[grab.index];
      if (!tile || hasPassed(tile, scroll.current)) return;

      // Letting go a shade early still counts — the last sliver of a holder is
      // not worth being precise about, and demanding it made the game feel
      // punishing rather than fast.
      if (canRelease(tile, grab.at, scroll.current)) {
        advance(true, 10 + tile.length * 5);
        return;
      }

      apiRef.current.setPrompt('Let go too soon');
      advance(false);
    },
    [advance],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  const from = Math.max(0, cursor - RENDER_BEHIND);
  const visible = tiles.slice(from, cursor + RENDER_AHEAD);
  const pulseScale = holdPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseOpacity = holdPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View
      style={[styles.stage, { backgroundColor: '#f7f3ea', borderColor: '#d8d1c4' }]}
      onLayout={onLayout}
    >
      {cell > 0 && (
        <>
          {/* Lane guides sit still while the track moves over them. */}
          {Array.from({ length: COLUMNS - 1 }, (_, i) => (
            <View
              key={`lane-${i}`}
              pointerEvents="none"
              style={[
                styles.lane,
                { left: (i + 1) * laneWidth, backgroundColor: '#d8d1c4' },
              ]}
            />
          ))}

          <Animated.View
            pointerEvents="none"
            style={[styles.track, { transform: [{ translateY }] }]}
          >
            {visible.map((tile: Tile) => {
              const done = tile.index < cursor;
              const holder = tile.kind === 'hold';
              const width = laneWidth;

              return (
                <View
                  key={tile.index}
                  style={[
                    styles.tile,
                    {
                      left: tile.column * laneWidth,
                      width,
                      bottom: tile.start * cell,
                      height: tile.length * cell,
                      borderRadius: 0,
                      backgroundColor: done ? alpha(accent, 0.45) : '#151515',
                    },
                  ]}
                >
                  {holder && !done && (
                    <>
                      <View
                        style={[
                          styles.holderTint,
                          { backgroundColor: alpha(holderAccent, held?.index === tile.index ? 0.1 : 0.06) },
                        ]}
                      />
                      {held?.index === tile.index && (
                        <Animated.View
                          style={[
                            styles.fill,
                            { height: fill, backgroundColor: alpha(holderAccent, 0.9) },
                          ]}
                        >
                          <View style={[styles.fillEdge, { backgroundColor: holderAccent }]} />
                        </Animated.View>
                      )}
                      {/* A bright guide and circular handle distinguish holds. */}
                      <View
                        style={[
                          styles.rail,
                          {
                            backgroundColor: holderAccent,
                            opacity: held?.index === tile.index ? 1 : 0.7,
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.holdHandleGlow,
                          {
                            backgroundColor: alpha(holderAccent, 0.2),
                            borderColor: holderAccent,
                            opacity: held?.index === tile.index ? pulseOpacity : 0.85,
                            transform: [
                              { scale: held?.index === tile.index ? pulseScale : 1 },
                            ],
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.holdHandle,
                            {
                              borderColor: holderAccent,
                              backgroundColor:
                                held?.index === tile.index ? holderAccent : '#151515',
                            },
                          ]}
                        />
                      </Animated.View>
                    </>
                  )}
                </View>
              );
            })}
          </Animated.View>

          {/* Full-height touch columns, so a press anywhere in a lane counts. */}
          {Array.from({ length: COLUMNS }, (_, column) => (
            <Pressable
              key={`hit-${column}`}
              accessibilityRole="button"
              accessibilityLabel={`Column ${column + 1}`}
              onPressIn={(event) => pressIn(column, event)}
              onPressOut={() => pressOut(column)}
              pressRetentionOffset={{
                left: laneWidth * 0.6,
                right: laneWidth * 0.6,
                top: 120,
                bottom: 120,
              }}
              style={[
                styles.column,
                {
                  left: column * laneWidth,
                  width: laneWidth,
                  backgroundColor:
                    wrong === column
                      ? alpha(theme.colors.danger, 0.28)
                      : 'transparent',
                },
              ]}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  lane: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  track: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  tile: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  holderTint: { ...StyleSheet.absoluteFillObject },
  rail: { position: 'absolute', width: 3, top: 16, bottom: 51, borderRadius: 2 },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  fillEdge: {
    position: 'absolute',
    left: 9,
    right: 9,
    top: 0,
    height: 2,
    shadowColor: '#22D3EE',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  holdHandleGlow: {
    position: 'absolute',
    bottom: 26,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00e5ff',
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  holdHandle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    backgroundColor: '#151515',
  },
  column: { position: 'absolute', top: 0, bottom: 0 },
});

export const blackKeys: GameDefinition = {
  id: 'black-keys',
  title: 'Black Keys',
  tagline: 'Tap and hold the falling piano tiles',
  category: 'speed',
  accent: 'violet',
  glyph: '🎹',
  howToPlay: [
    'Black tiles fall down four piano lanes and the track never waits for you.',
    'Tap a short tile any time it is visible on the board.',
    'Long tiles have a blue line and circular handle: press anywhere on the tile and hold.',
    'A wrong lane, missed tile or early release costs a life.',
    'There is no timer: the track keeps speeding up until all five lives are gone.',
  ],
  immersive: true,
  session: { mode: 'lives', lives: 5 },
  progression: { levelUpEvery: 8 },
  pointsPerRound: 10,
  component: BlackKeys,
};
