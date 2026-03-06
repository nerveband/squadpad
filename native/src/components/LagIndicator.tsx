import { Text, StyleSheet, View } from 'react-native';
import { WifiHigh } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Fonts, FontSize } from '../theme/typography';

interface LagIndicatorProps {
  lagMs: number | null;
}

function getLagColor(ms: number | null): string {
  if (ms == null) return Colors.textDim;
  if (ms < 80) return Colors.teal;
  if (ms <= 150) return Colors.gold;
  return Colors.danger;
}

export function LagIndicator({ lagMs }: LagIndicatorProps) {
  const color = getLagColor(lagMs);
  const text = lagMs != null ? `${lagMs}ms` : '--';

  return (
    <View style={styles.container}>
      <WifiHigh size={14} color={color} weight="bold" />
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Fixed width prevents HUD layout shift when lag text changes
    minWidth: 56,
  },
  text: {
    fontFamily: Fonts.mono,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 40,
  },
});
