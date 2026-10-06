import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { WifiHigh } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';
import type { DiscoveredGame } from '../connection/discovery';

/** How long to scan before suggesting fixes. */
const HINT_DELAY_MS = 6000;

interface GameListProps {
  games: DiscoveredGame[];
  scanning: boolean;
  error?: string | null;
  onSelect: (game: DiscoveredGame) => void;
  onManualEntry: () => void;
}

export function GameList({ games, scanning, error, onSelect, onManualEntry }: GameListProps) {
  const [showHint, setShowHint] = useState(false);
  const empty = games.length === 0;

  useEffect(() => {
    if (!scanning || !empty) {
      setShowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [scanning, empty]);

  if (error) return <Text style={styles.errorText}>{error}</Text>;

  if (empty) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyRow}>
          {scanning && <ActivityIndicator size="small" color={Colors.teal} />}
          <Text style={styles.empty}>
            {scanning ? 'Scanning your network...' : 'No games found on your network'}
          </Text>
        </View>
        {showHint && (
          <Animated.View entering={FadeIn.duration(250)} style={styles.hint}>
            <Text style={styles.hintText}>
              Not seeing your game? Open BombSquad on a computer or tablet on the same Wi-Fi.
              {Platform.OS === 'ios'
                ? ' SquadPad also needs Local Network access, which you can turn on in Settings.'
                : ''}
            </Text>
            <View style={styles.hintActions}>
              {Platform.OS === 'ios' && (
                <Pressable onPress={() => Linking.openSettings()} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.hintLink}>Open Settings</Text>
                </Pressable>
              )}
              <Pressable onPress={onManualEntry} hitSlop={8} accessibilityRole="button">
                <Text style={styles.hintLink}>Enter IP address</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {games.map((game, index) => (
        <Animated.View key={`${game.address}:${game.port}`} entering={FadeInDown.delay(index * 80)}>
          <Pressable
            onPress={() => onSelect(game)}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Join ${game.gameName} at ${game.address}`}
          >
            <WifiHigh size={20} color={Colors.teal} weight="bold" />
            <View style={styles.itemText}>
              <Text style={styles.gameName}>{game.gameName}</Text>
              <Text style={styles.gameAddress}>{game.address}</Text>
            </View>
            <Text style={styles.joinText}>Join</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  empty: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  hint: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  hintText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  hintActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  hintLink: {
    color: Colors.teal,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  joinText: {
    color: Colors.teal,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(92,196,176,0.06)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(92,196,176,0.12)',
    padding: Spacing.md,
  },
  itemPressed: {
    backgroundColor: 'rgba(92,196,176,0.12)',
  },
  itemText: {
    flex: 1,
  },
  gameName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  gameAddress: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
});
