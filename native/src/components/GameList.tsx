import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { WifiHigh } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';
import type { DiscoveredGame } from '../connection/discovery';

interface GameListProps {
  games: DiscoveredGame[];
  scanning: boolean;
  error?: string | null;
  onSelect: (game: DiscoveredGame) => void;
}

export function GameList({ games, scanning, error, onSelect }: GameListProps) {
  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : games.length === 0 ? (
        <View style={styles.emptyRow}>
          {scanning && <ActivityIndicator size="small" color={Colors.teal} />}
          <Text style={styles.empty}>
            {scanning ? 'Scanning your network...' : 'No games found on your network'}
          </Text>
        </View>
      ) : (
        games.map((game, index) => (
          <Animated.View key={`${game.address}:${game.port}`} entering={FadeInDown.delay(index * 80)}>
            <Pressable
              onPress={() => onSelect(game)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <WifiHigh size={20} color={Colors.teal} weight="bold" />
              <View style={styles.itemText}>
                <Text style={styles.gameName}>{game.gameName}</Text>
                <Text style={styles.gameAddress}>{game.address}</Text>
              </View>
            </Pressable>
          </Animated.View>
        ))
      )}
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
