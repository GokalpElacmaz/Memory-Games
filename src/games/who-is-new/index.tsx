import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { clamp, pick, shuffle } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { accents } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

const FACES = ['😀', '😎', '🤖', '👻', '🐙', '🦊', '🐸', '🦉', '🐝', '🌵', '🍀', '⚡', '🔔', '🎈', '🧩', '🚀'];
const BACKDROPS = [accents.emerald, accents.cyan, accents.violet, accents.amber, accents.rose, accents.blue];

type Token = { id: string; face: string; color: string };
type Placed = Token & { x: number; y: number };

/** Face/colour combinations; identity is the pair, never the position. */
const POOL: Token[] = FACES.flatMap((face) =>
  BACKDROPS.map((color) => ({ id: `${face}:${color}`, face, color })),
);

/** A run stops here so the board stays readable on a phone. */
const MAX_TOKENS = 25;
/** Blank beat between rounds, so the new arrangement arrives all at once. */
const BLANK_MS = 1000;

/**
 * Drops `count` circles of diameter `size` at random points that do not
 * overlap. Rejection sampling, relaxing the required spacing if a crowded
 * board cannot be filled at the roomiest setting.
 */
function scatter(count: number, size: number, width: number, height: number) {
  for (const padding of [10, 6, 3, 1]) {
    const points: { x: number; y: number }[] = [];
    const minDist = size + padding;
    let failed = false;

    for (let i = 0; i < count && !failed; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 400 && !placed; attempt++) {
        const x = Math.random() * Math.max(1, width - size);
        const y = Math.random() * Math.max(1, height - size);
        if (points.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist)) {
          points.push({ x, y });
          placed = true;
        }
      }
      if (!placed) failed = true;
    }

    if (!failed) return points;
  }

  // Should not happen at MAX_TOKENS, but never return a short list.
  const columns = Math.max(1, Math.floor(width / (size + 2)));
  return Array.from({ length: count }, (_, i) => ({
    x: (i % columns) * (size + 2),
    y: Math.floor(i / columns) * (size + 2),
  }));
}

type Phase = 'blank' | 'pick' | 'reveal';

function WhoIsNew({ api }: GameComponentProps) {
  const theme = useTheme();

  const [known, setKnown] = useState<Token[]>([]);
  const [fresh, setFresh] = useState<Token | null>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('blank');
  const [area, setArea] = useState({ width: 0, height: 0 });

  const knownRef = useRef(known);
  knownRef.current = known;
  const areaRef = useRef(area);
  areaRef.current = area;
  const answered = useRef(false);

  const tokenSize = useMemo(() => {
    const count = Math.max(placed.length, 1);
    if (area.width === 0) return 0;
    // Shrink as the board fills so a full set still has room to scatter.
    return clamp(Math.sqrt((area.width * area.height) / count) * 0.62, 34, 68);
  }, [area, placed.length]);

  useEffect(() => {
    if (!api.round || area.width === 0) return;
    answered.current = false;
    setWrongId(null);
    setFresh(null);
    // Blank first: no faces at all, so the next arrangement lands in one go
    // instead of the player watching the newcomer get added.
    setPlaced([]);
    setPhase('blank');
    api.setPrompt('Next round…');

    const current = knownRef.current;
    if (current.length >= MAX_TOKENS) {
      api.setPrompt('Board full — nothing left to add');
      api.endRun();
      return;
    }

    const taken = new Set(current.map((t) => t.id));
    const newcomer = pick(POOL.filter((t) => !taken.has(t.id)));

    const id = setTimeout(() => {
      const cast = shuffle([...current, newcomer]);
      const { width, height } = areaRef.current;
      const size = clamp(Math.sqrt((width * height) / cast.length) * 0.62, 34, 68);
      const spots = scatter(cast.length, size, width, height);

      setFresh(newcomer);
      setPlaced(cast.map((token, i) => ({ ...token, ...spots[i] })));
      setPhase('pick');
      api.setPrompt('One face is new — tap it');
    }, BLANK_MS + api.memoriseBonusMs);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round, area.width, area.height]);

  const onTokenPress = useCallback(
    (token: Token) => {
      if (phase !== 'pick' || answered.current || !fresh) return;
      answered.current = true;
      setPhase('reveal');
      setKnown((prev) => [...prev, fresh]);

      if (token.id === fresh.id) {
        api.setPrompt('Correct');
        api.haptic('success');
        api.submit(true, { delayMs: 520 });
      } else {
        setWrongId(token.id);
        api.setPrompt('That one was already here');
        api.haptic('error');
        api.submit(false, { delayMs: 1150 });
      }
    },
    [api, fresh, phase],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  return (
    <View style={styles.stage} onLayout={onLayout}>
      {placed.map((item) => {
        const isFresh = fresh?.id === item.id;
        const isWrong = wrongId === item.id;
        const highlight = phase === 'reveal' && isFresh;

        return (
          <PressableScale
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Face ${item.face}`}
            disabled={phase !== 'pick'}
            onPress={() => onTokenPress(item)}
            style={[
              styles.token,
              {
                left: item.x,
                top: item.y,
                width: tokenSize,
                height: tokenSize,
                borderRadius: tokenSize / 2,
                backgroundColor: item.color,
                borderWidth: highlight || isWrong ? 4 : 0,
                borderColor: isWrong ? theme.colors.danger : theme.colors.success,
              },
            ]}
          >
            <Text style={[styles.face, { fontSize: tokenSize * 0.46 }]}>{item.face}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, margin: 16 },
  token: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  face: { textAlign: 'center' },
});

export const whoIsNew: GameDefinition = {
  id: 'who-is-new',
  title: "Who's New",
  tagline: 'Find the face that just joined',
  category: 'memory',
  accent: 'rose',
  glyph: '🙂',
  howToPlay: [
    'A group of coloured faces is scattered across the board.',
    'The board blanks, then comes back with one extra face — tap the newcomer.',
    'Everything moves every round, so remember the faces, not the places.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 10 + 6 * level,
  component: WhoIsNew,
};
