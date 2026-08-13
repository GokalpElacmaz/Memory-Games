import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/Pressable';
import { Screen } from '@/components/Screen';
import { useProgress } from '@/storage/progress';
import { useSettings, type Settings } from '@/storage/settings';
import { alpha, useTheme } from '@/theme/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, update } = useSettings();
  const { resetAll } = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const accent = theme.accents.emerald;

  // Deep links can land here with no history, where back() would be a no-op.
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>

        <Group title="Appearance">
          <Segmented<Settings['theme']>
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => update({ theme })}
          />
        </Group>

        <Group title="Feel">
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>Haptics</Text>
              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                Vibrate on hits and misses
              </Text>
            </View>
            <Switch
              value={settings.haptics}
              onValueChange={(haptics) => update({ haptics })}
              trackColor={{ true: accent, false: theme.colors.surfaceAlt }}
            />
          </View>
        </Group>

        <Group title="Difficulty">
          <Text style={[styles.rowHint, { color: theme.colors.textMuted, marginBottom: 10 }]}>
            Extra time to study patterns before they hide.
          </Text>
          <Segmented<Settings['extraMemoriseTime']>
            value={settings.extraMemoriseTime}
            options={[
              { value: 0, label: 'Normal' },
              { value: 1, label: '+1s' },
              { value: 2, label: '+2s' },
            ]}
            onChange={(extraMemoriseTime) => update({ extraMemoriseTime })}
          />
        </Group>

        <Group title="Data">
          <Button
            label={confirmReset ? 'Tap again to erase all scores' : 'Reset progress'}
            variant="secondary"
            tint={theme.colors.danger}
            onPress={() => {
              if (confirmReset) {
                resetAll();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
              }
            }}
          />
        </Group>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Done" onPress={close} tint={accent} />
      </View>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.colors.textFaint }]}>{title.toUpperCase()}</Text>
      <View style={[styles.groupBody, { backgroundColor: theme.colors.surface }]}>{children}</View>
    </View>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  const accent = theme.accents.emerald;
  return (
    <View style={[styles.segmented, { backgroundColor: theme.colors.surfaceAlt }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            scaleTo={0.97}
            style={[styles.segment, active && { backgroundColor: alpha(accent, 0.22) }]}
          >
            <Text
              style={[styles.segmentLabel, { color: active ? accent : theme.colors.textMuted }]}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, gap: 22 },
  title: { fontSize: 28, fontWeight: '800', paddingTop: 8 },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  groupBody: { borderRadius: 18, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowHint: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  segmented: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentLabel: { fontSize: 14, fontWeight: '700' },
  actions: { padding: 20, paddingTop: 0 },
});
