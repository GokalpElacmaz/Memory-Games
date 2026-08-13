import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { PressableScale } from '@/components/Pressable';
import { pick } from '@/engine/rng';
import type { GameComponentProps, GameDefinition } from '@/engine/types';
import { alpha, useTheme } from '@/theme/theme';

/**
 * Board shape — 144 cells, three times the original 6×8. The square layout
 * keeps the cells as large and tappable as possible at this density.
 */
const COLS = 12;
const ROWS = 12;
const CELLS = COLS * ROWS;
/** Match Who's New: a clean blank beat before the changed board appears. */
const BLANK_MS = 1000;

type Phase = 'blank' | 'pick' | 'reveal';

function WhatsNew({ api }: GameComponentProps) {
  const theme = useTheme();
  const accent = theme.accent('violet');

  // Cells the player has already seen; survives across rounds by design.
  const [known, setKnown] = useState<number[]>([]);
  const [fresh, setFresh] = useState<number | null>(null);
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('blank');
  const knownRef = useRef(known);
  knownRef.current = known;
  const answered = useRef(false);

  useEffect(() => {
    if (!api.round) return;
    answered.current = false;
    setWrongPick(null);
    setFresh(null);
    setPhase('blank');
    api.setPrompt('Next round…');

    const current = knownRef.current;
    if (current.length >= CELLS - 1) {
      api.setPrompt('You filled the whole board');
      api.endRun();
      return;
    }

    const reveal = () => {
      const options = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !current.includes(i));
      setFresh(pick(options));
      setPhase('pick');
      api.setPrompt('One cell is new — tap it');
    };

    const id = setTimeout(reveal, BLANK_MS + api.memoriseBonusMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  const onCellPress = useCallback(
    (index: number) => {
      if (phase !== 'pick' || answered.current || fresh === null) return;
      // Only lit cells are answerable; empty ones are not choices.
      if (index !== fresh && !known.includes(index)) return;

      answered.current = true;
      setPhase('reveal');
      setKnown((prev) => [...prev, fresh]);

      if (index === fresh) {
        api.setPrompt('Correct');
        api.haptic('success');
        api.submit(true, { delayMs: 500 });
      } else {
        setWrongPick(index);
        api.setPrompt('That one was already there');
        api.haptic('error');
        api.submit(false, { delayMs: 1100 });
      }
    },
    [api, fresh, known, phase],
  );

  return (
    <Board>
      {({ width, height }) => {
        if (phase === 'blank') return null;

        const gap = 4;
        const cell = Math.min((width - gap * (COLS - 1)) / COLS, (height - gap * (ROWS - 1)) / ROWS);
        const boardWidth = cell * COLS + gap * (COLS - 1);

        return (
          <View style={[styles.grid, { width: boardWidth, gap }]}>
            {Array.from({ length: CELLS }, (_, index) => {
              const isKnown = known.includes(index);
              const isFresh = fresh === index;
              const visible = isKnown || isFresh;
              const highlightFresh = phase === 'reveal' && isFresh;
              const flagWrong = wrongPick === index;

              return (
                <PressableScale
                  key={index}
                  accessibilityRole="button"
                  disabled={phase !== 'pick' || !visible}
                  onPress={() => onCellPress(index)}
                  scaleTo={0.9}
                  style={[
                    {
                      width: cell,
                      height: cell,
                      borderRadius: Math.max(6, cell * 0.24),
                      backgroundColor: flagWrong
                        ? theme.colors.danger
                        : highlightFresh
                          ? theme.colors.success
                          : visible
                            ? accent
                            : theme.colors.surface,
                      borderWidth: visible ? 0 : 1,
                      borderColor: alpha(theme.colors.border, 0.6),
                    },
                  ]}
                />
              );
            })}
          </View>
        );
      }}
    </Board>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});

export const whatsNew: GameDefinition = {
  id: 'whats-new',
  title: "What's New",
  tagline: 'Spot the cell that just appeared',
  category: 'memory',
  accent: 'violet',
  glyph: '✨',
  howToPlay: [
    'The board shows every cell you have already found.',
    'The board blanks between rounds, then returns with one extra lit cell.',
    'Tap the new cell.',
    'The set keeps growing, so keep the whole picture in mind.',
  ],
  session: { mode: 'lives', lives: 3 },
  progression: { levelUpEvery: 1 },
  pointsPerRound: (level) => 8 + 4 * level,
  component: WhatsNew,
};
