import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { alpha } from '@/theme/theme';

type Props = {
  accent: string;
  best: number;
  gameTitle: string;
  glyph: string;
  level: number;
  newBest: boolean;
  score: number;
};

/**
 * A self-contained result card designed to be captured as a shareable image.
 * It deliberately uses a fixed dark palette so the exported PNG looks the
 * same regardless of the player's system theme.
 */
export const ScoreShareCard = forwardRef<View, Props>(function ScoreShareCard(
  { accent, best, gameTitle, glyph, level, newBest, score },
  ref,
) {
  return (
    <View
      ref={ref}
      collapsable={false}
      renderToHardwareTextureAndroid
      style={styles.card}
    >
      <View style={[styles.glowLarge, { backgroundColor: alpha(accent, 0.18) }]} />
      <View style={[styles.glowSmall, { backgroundColor: alpha(accent, 0.12) }]} />

      <View style={styles.brandRow}>
        <Image source={require('../../assets/memory-games-share-icon.png')} style={styles.appIcon} />
        <View style={styles.brandCopy}>
          <Text style={styles.brand}>MEMORY GAMES</Text>
          <Text style={styles.game} numberOfLines={1}>
            {gameTitle}
          </Text>
        </View>
        <View style={[styles.glyphBadge, { borderColor: alpha(accent, 0.42) }]}>
          <Text style={styles.glyph}>{glyph}</Text>
        </View>
      </View>

      <View style={styles.scoreBlock}>
        <Text style={[styles.scoreLabel, { color: accent }]}>FINAL SCORE</Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          numberOfLines={1}
          style={styles.score}
        >
          {formatNumber(score)}
        </Text>
        {newBest ? (
          <View style={[styles.bestBadge, { backgroundColor: accent }]}>
            <Text style={styles.bestBadgeText}>NEW PERSONAL BEST</Text>
          </View>
        ) : (
          <Text style={styles.challenge}>Can you beat it?</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <ShareStat label="LEVEL" value={formatNumber(level)} />
        <View style={[styles.divider, { backgroundColor: alpha(accent, 0.36) }]} />
        <ShareStat label="PERSONAL BEST" value={formatNumber(best)} />
      </View>
    </View>
  );
});

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatNumber(value: number): string {
  return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1.25,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#0E1220',
    borderWidth: 1,
    borderColor: '#28324F',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  glowLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -132,
    right: -62,
  },
  glowSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -92,
    left: -48,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  appIcon: { width: 34, height: 34, borderRadius: 9 },
  brandCopy: { flex: 1, marginLeft: 9, marginRight: 8 },
  brand: { color: '#9EA9C8', fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  game: { color: '#F7F8FC', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  glyphBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glyph: { fontSize: 20 },
  scoreBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  scoreLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  score: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    textAlign: 'center',
  },
  bestBadge: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  bestBadgeText: { color: '#0B1020', fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  challenge: { color: '#7F89A7', fontSize: 10, fontWeight: '700' },
  statsRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.055)',
    paddingVertical: 6,
  },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statValue: {
    width: '100%',
    color: '#F7F8FC',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  statLabel: { color: '#7F89A7', fontSize: 7, fontWeight: '800', letterSpacing: 0.85 },
  divider: { width: 1, height: 25 },
});
