import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { playHaptic } from '../controller/haptics';

const BUTTON_SIZE = 82;

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
      scale.value = withSpring(0.85, { damping: 15, stiffness: 400 });
      pressed.value = withTiming(1, { duration: 50 });
      runOnJS(doPress)();
    })
    .onTouchesUp(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(doRelease)();
    })
    .onTouchesCancelled(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(doRelease)();
    })
    .shouldCancelWhenOutside(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: pressed.value > 0.5 ? 1.0 : 0.45,
    shadowRadius: pressed.value > 0.5 ? 32 : 14,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: pressed.value > 0.5
      ? 'rgba(255,255,255,0.55)'
      : 'rgba(255,255,255,0.22)',
  }));

  const brightnessStyle = useAnimatedStyle(() => ({
    opacity: pressed.value > 0.5 ? 0.35 : 0,
  }));

  return (
    <GestureDetector gesture={tap}>
      {/* Tap zone fills entire parent — slap anywhere in the zone */}
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
              start={{ x: 0.3, y: 0.15 }}
              end={{ x: 0.8, y: 0.95 }}
              style={styles.gradient}
            />
            {/* Glossy shine highlight */}
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.06)', 'transparent']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.25, y: 0 }}
              end={{ x: 0.75, y: 0.65 }}
              style={styles.shine}
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
  tapZone: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualBtn: {
    width: BUTTON_SIZE + 22,
    height: BUTTON_SIZE + 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    top: 11,
    left: 11,
    right: 11,
    bottom: 11,
    borderRadius: BUTTON_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  face: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: BUTTON_SIZE / 2,
    borderTopRightRadius: BUTTON_SIZE / 2,
  },
  brightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: BUTTON_SIZE / 2,
  },
  insetGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  iconContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
