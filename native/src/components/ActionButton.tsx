import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { playHaptic } from '../controller/haptics';

const BUTTON_SIZE = 64;

export interface ActionButtonConfig {
  name: string;
  icon: React.ReactNode;
  colors: [string, string];
  glowColor: string;
}

interface ActionButtonProps {
  config: ActionButtonConfig;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
  hapticsEnabled?: boolean;
  hapticIntensity?: 'low' | 'medium' | 'high';
}

export function ActionButton({ config, onPressIn, onPressOut, hapticsEnabled = true, hapticIntensity = 'medium' }: ActionButtonProps) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const doPress = () => {
    playHaptic(config.name, hapticsEnabled, hapticIntensity);
    onPressIn(config.name);
  };

  const doRelease = () => {
    onPressOut(config.name);
  };

  const tap = Gesture.Manual()
    .onTouchesDown(() => {
      scale.value = withSpring(0.82, { damping: 15, stiffness: 400 });
      pressed.value = withTiming(1, { duration: 50 });
      runOnJS(doPress)();
    })
    .onTouchesUp(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      pressed.value = withTiming(0, { duration: 150 });
      runOnJS(doRelease)();
    })
    .onTouchesCancelled(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      pressed.value = withTiming(0, { duration: 150 });
      runOnJS(doRelease)();
    })
    .shouldCancelWhenOutside(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: pressed.value > 0.5 ? 1.0 : 0.3,
    shadowRadius: pressed.value > 0.5 ? 40 : 8,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: pressed.value > 0.5
      ? 'rgba(255,255,255,0.6)'
      : 'rgba(255,255,255,0.18)',
  }));

  const brightnessStyle = useAnimatedStyle(() => ({
    opacity: pressed.value > 0.5 ? 0.35 : 0,
  }));

  return (
    <GestureDetector gesture={tap}>
      {/* Tap zone fills entire parent — you can slap anywhere in the zone */}
      <Animated.View style={styles.tapZone}>
        {/* Visual button stays centered and compact */}
        <Animated.View style={[styles.visualBtn, animatedStyle]}>
          <Animated.View
            style={[styles.glow, { shadowColor: config.glowColor }, glowStyle]}
          />
          <Animated.View
            style={[styles.face, { shadowColor: config.colors[0] }, borderStyle]}
          >
            <LinearGradient
              colors={[config.colors[0], config.colors[1]]}
              start={{ x: 0.4, y: 0.35 }}
              end={{ x: 0.8, y: 0.9 }}
              style={styles.gradient}
            />
            <Animated.View style={[styles.brightnessOverlay, brightnessStyle]} />
            <Animated.View style={[styles.insetGlow, brightnessStyle]} />
            <View style={styles.iconContainer}>
              {config.icon}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Fills parent — the ENTIRE zone is the tap target
  tapZone: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualBtn: {
    width: BUTTON_SIZE + 16,
    height: BUTTON_SIZE + 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: BUTTON_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    backgroundColor: 'transparent',
  },
  face: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
  },
  brightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: BUTTON_SIZE / 2,
  },
  insetGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  iconContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
