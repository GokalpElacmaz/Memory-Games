import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { GameHost } from '@/engine/GameHost';
import { getGame } from '@/games';
import { useTheme } from '@/theme/theme';

export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const game = getGame(id);

  if (!game) {
    return (
      <Screen>
        <View style={styles.missing}>
          <Text style={[styles.missingTitle, { color: theme.colors.text }]}>Game not found</Text>
          <Text style={[styles.missingBody, { color: theme.colors.textMuted }]}>
            “{id}” is not in the registry.
          </Text>
          <Button label="Back to games" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  // Remount on id change so nothing leaks between games.
  return <GameHost key={game.id} def={game} />;
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  missingTitle: { fontSize: 22, fontWeight: '800' },
  missingBody: { fontSize: 15, textAlign: 'center', marginBottom: 12 },
});
