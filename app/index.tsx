import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/Pressable';
import { Screen } from '@/components/Screen';
import { categoryLabels, type GameCategory, type GameDefinition } from '@/engine/types';
import { GAMES } from '@/games';
import { useProgress } from '@/storage/progress';
import { alpha, useTheme } from '@/theme/theme';

const CATEGORY_ORDER: GameCategory[] = ['memory', 'attention', 'logic', 'speed'];

export default function Home() {
  const theme = useTheme();
  const router = useRouter();
  const { progress } = useProgress();

  const sections = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      games: GAMES.filter((game) => game.category === category),
    })).filter((section) => section.games.length > 0);
  }, []);

  const totals = useMemo(() => {
    const records = Object.values(progress);
    return {
      plays: records.reduce((sum, r) => sum + r.plays, 0),
      best: records.reduce((sum, r) => sum + r.bestScore, 0),
    };
  }, [progress]);

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Training Mind</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {totals.plays > 0
                ? `${totals.plays} runs · ${totals.best} points banked`
                : 'Short workouts for memory and attention'}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            style={[styles.settingsButton, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={styles.settingsGlyph}>⚙️</Text>
          </PressableScale>
        </View>

        {sections.map((section) => (
          <View key={section.category} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textFaint }]}>
              {categoryLabels[section.category].toUpperCase()}
            </Text>
            <View style={styles.cards}>
              {section.games.map((game) => (
                <GameCard key={game.id} game={game} onPress={() => router.push(`/game/${game.id}`)} />
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.footer, { color: theme.colors.textFaint }]}>
          {GAMES.length} games · more on the way
        </Text>
      </ScrollView>
    </Screen>
  );
}

function GameCard({ game, onPress }: { game: GameDefinition; onPress: () => void }) {
  const theme = useTheme();
  const { recordOf } = useProgress();
  const record = recordOf(game.id);
  const accent = theme.accent(game.accent);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${game.title}. ${game.tagline}`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
    >
      <View style={[styles.cardGlyph, { backgroundColor: alpha(accent, 0.18) }]}>
        <Text style={styles.cardGlyphText}>{game.glyph}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{game.title}</Text>
        <Text numberOfLines={2} style={[styles.cardTagline, { color: theme.colors.textMuted }]}>
          {game.tagline}
        </Text>
      </View>
      <View style={styles.cardMeta}>
        <Text style={[styles.cardBest, { color: record.bestScore > 0 ? accent : theme.colors.textFaint }]}>
          {record.bestScore > 0 ? record.bestScore : '—'}
        </Text>
        <Text style={[styles.cardBestLabel, { color: theme.colors.textFaint }]}>best</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40, gap: 26 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, fontWeight: '500' },
  settingsButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  settingsGlyph: { fontSize: 20 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  cards: { gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20 },
  cardGlyph: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardGlyphText: { fontSize: 26 },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardTagline: { fontSize: 13, fontWeight: '500', lineHeight: 17 },
  cardMeta: { alignItems: 'flex-end', minWidth: 44 },
  cardBest: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardBestLabel: { fontSize: 10, fontWeight: '600' },

  footer: { textAlign: 'center', fontSize: 12, fontWeight: '600' },
});
