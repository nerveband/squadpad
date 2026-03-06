import { Pressable, Text, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BentoCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  bgColor: string;
  onPress: () => void;
  style?: ViewStyle;
}

export function BentoCard({ icon, title, description, accentColor, bgColor, onPress, style }: BentoCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 300 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
      onPress={onPress}
      style={[styles.card, { backgroundColor: bgColor }, animatedStyle, style]}
    >
      <View style={[styles.iconWrap, { shadowColor: accentColor }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.white08,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconWrap: {
    marginBottom: Spacing.xs,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  description: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
