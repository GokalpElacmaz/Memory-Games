import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useProgress } from '@/storage/progress';
import { alpha, useTheme } from '@/theme/theme';

import { Hud } from './Hud';
import { categoryLabels, type GameDefinition } from './types';
import { useGameSession, type RunOutcome } from './useGameSession';

type Stage = 'intro' | 'run';

/**
 * The shell every game runs inside: how-to-play card, HUD, countdown, results.
 * A game component never has to know any of this exists.
 */
export function GameHost({ def }: { def: GameDefinition }) {
  const theme = useTheme();
  const router = useRouter();
  const { recordOf, recordRun } = useProgress();
  const accent = theme.accent(def.accent);

  const [stage, setStage] = useState<Stage>('intro');
  // Bumped on every replay so the game component remounts with clean state.
  const [runId, setRunId] = useState(0);
  const [outcome, setOutcome] = useState<(RunOutcome & { newBest: boolean }) | null>(null);

  const record = recordOf(def.id);

  const handleFinished = useCallback(
    (result: RunOutcome) => {
      const { newBestScore } = recordRun(def.id, { score: result.score, level: result.level });
      setOutcome({ ...result, newBest: newBestScore });
    },
    [def.id, recordRun],
  );

  const { api, state, restart } = useGameSession(def, handleFinished);

  const start = useCallback(() => {
    setOutcome(null);
    setRunId((n) => n + 1);
    setStage('run');
    restart();
  }, [restart]);

  const replay = useCallback(() => {
    setOutcome(null);
    setRunId((n) => n + 1);
    restart();
  }, [restart]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (stage === 'intro') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.introScroll}>
          <View style={styles.introHeader}>
            <View style={[styles.glyphBadge, { backgroundColor: alpha(accent, 0.16) }]}>
              <Text style={styles.glyph}>{def.glyph}</Text>
            </View>
            <Text style={[styles.introTitle, { color: theme.colors.text }]}>{def.title}</Text>
            <Text style={[styles.introCategory, { color: accent }]}>
              {categoryLabels[def.category]}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>How to play</Text>
            {def.howToPlay.map((line, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: accent }]} />
                <Text style={[styles.bulletText, { color: theme.colors.textMuted }]}>{line}</Text>
              </View>
            ))}
          </View>

          <View style={styles.recordRow}>
            <RecordTile label="Best score" value={String(record.bestScore)} />
            <RecordTile label="Best level" value={String(record.bestLevel)} />
            <RecordTile label="Plays" value={String(record.plays)} />
          </View>
        </ScrollView>

        <View style={styles.introActions}>
          <Button label="Start" onPress={start} tint={accent} />
          <Button label="Back" onPress={leave} variant="ghost" tint={theme.colors.textMuted} />
        </View>
      </Screen>
    );
  }

  const GameComponent = def.component;
  const game = <GameComponent key={runId} api={api} />;
  const hud = (
    <Hud
      accent={accent}
      level={state.level}
      score={state.score}
      lives={state.lives}
      maxLives={state.maxLives}
      timeLeft={state.timeLeft}
      prompt={state.prompt}
      round={state.round}
      roundLimitMs={api.roundLimitMs}
      overlay={def.immersive}
      onQuit={leave}
    />
  );

  return (
    <Screen edges={def.immersive ? [] : undefined}>
      {def.immersive ? (
        <View style={styles.immersiveRun}>
          <View style={StyleSheet.absoluteFill}>{game}</View>
          {hud}
        </View>
      ) : (
        <>
          {hud}
          <View style={styles.stage}>{game}</View>
        </>
      )}

      {state.phase === 'countdown' && (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut.duration(180)}
          style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
        >
          <Animated.Text
            key={state.countdown}
            entering={ZoomIn.duration(220)}
            style={[styles.countdown, { color: accent }]}
          >
            {state.countdown}
          </Animated.Text>
          <Text style={[styles.countdownHint, { color: theme.colors.textMuted }]}>Get ready</Text>
        </Animated.View>
      )}

      {outcome && (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
        >
          <View style={[styles.resultCard, { backgroundColor: theme.colors.bgElevated }]}>
            <Text style={[styles.resultTitle, { color: theme.colors.text }]}>
              {outcome.reason === 'time' ? "Time's up" : 'Run over'}
            </Text>
            {outcome.newBest && (
              <Text style={[styles.newBest, { color: accent }]}>New personal best</Text>
            )}
            <View style={styles.resultStats}>
              <RecordTile label="Score" value={String(outcome.score)} />
              <RecordTile label="Level" value={String(outcome.level)} />
              <RecordTile label="Best" value={String(Math.max(record.bestScore, outcome.score))} />
            </View>
            <Button label="Play again" onPress={replay} tint={accent} style={styles.resultButton} />
            <Button
              label="Back to games"
              onPress={leave}
              variant="ghost"
              tint={theme.colors.textMuted}
            />
          </View>
        </Animated.View>
      )}
    </Screen>
  );
}

function RecordTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: alpha(theme.colors.surfaceAlt, 0.7) }]}>
      <Text style={[styles.tileValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.colors.textFaint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  introScroll: { padding: 20, paddingBottom: 8, gap: 20 },
  introHeader: { alignItems: 'center', gap: 8, paddingTop: 12 },
  glyphBadge: { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 42 },
  introTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  introCategory: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  card: { borderRadius: 20, padding: 18, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  recordRow: { flexDirection: 'row', gap: 10 },
  introActions: { padding: 20, paddingTop: 4, gap: 8 },

  stage: { flex: 1 },
  immersiveRun: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  countdown: { fontSize: 92, fontWeight: '900' },
  countdownHint: { fontSize: 15, fontWeight: '600' },

  resultCard: { width: '100%', maxWidth: 380, borderRadius: 26, padding: 22, gap: 12, alignItems: 'stretch' },
  resultTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  newBest: { fontSize: 13, fontWeight: '700', textAlign: 'center', letterSpacing: 0.6 },
  resultStats: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  resultButton: { marginTop: 4 },

  tile: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 11, fontWeight: '600' },
});
