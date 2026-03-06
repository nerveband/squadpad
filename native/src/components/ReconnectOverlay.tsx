import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CircleNotch } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';

interface ReconnectOverlayProps {
  visible: boolean;
  attempt: number;
  maxAttempts: number;
}

export function ReconnectOverlay({ visible, attempt, maxAttempts }: ReconnectOverlayProps) {
  if (!visible) return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.overlay}>
      <View style={styles.card}>
        <CircleNotch size={32} color={Colors.purple} weight="bold" />
        <Text style={styles.title}>Reconnecting...</Text>
        <Text style={styles.subtitle}>
          Attempt {attempt} of {maxAttempts}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,11,26,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 32,
    paddingHorizontal: 48,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
});
