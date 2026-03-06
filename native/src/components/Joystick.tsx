import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme/colors';

const BASE_SIZE = 140;
const THUMB_SIZE = 56;
const MAX_DISTANCE = (BASE_SIZE - THUMB_SIZE) / 2;
const DEAD_ZONE = 0.15; // 15% dead zone to prevent false inputs

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  sensitivity?: number; // 0.5 to 2.0, default 1.0
}

function applyDeadZone(value: number, sensitivity: number): number {
  'worklet';
  const abs = Math.abs(value);
  if (abs < DEAD_ZONE) return 0;
  const sign = value > 0 ? 1 : -1;
  const normalized = (abs - DEAD_ZONE) / (1 - DEAD_ZONE);
  // Apply sensitivity curve — >1 = more responsive, <1 = less
  const curved = Math.pow(normalized, 1 / sensitivity);
  return sign * Math.min(1, curved);
}

export function Joystick({ onMove, sensitivity = 1.0 }: JoystickProps) {
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const thumbX = useSharedValue(0);
  const thumbY = useSharedValue(0);
  const baseOpacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0.15);
  const thumbGlowOpacity = useSharedValue(0.4);

  const emitMove = (x: number, y: number) => {
    onMove(x, y);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      baseX.value = e.x;
      baseY.value = e.y;
      thumbX.value = 0;
      thumbY.value = 0;
      baseOpacity.value = withTiming(1, { duration: 100 });
      borderOpacity.value = withTiming(0.4, { duration: 100 });
      thumbGlowOpacity.value = withTiming(0.8, { duration: 100 });
    })
    .onUpdate((e) => {
      const dx = e.x - baseX.value;
      const dy = e.y - baseY.value;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > MAX_DISTANCE) {
        const scale = MAX_DISTANCE / dist;
        thumbX.value = dx * scale;
        thumbY.value = dy * scale;
      } else {
        thumbX.value = dx;
        thumbY.value = dy;
      }

      const rawX = thumbX.value / MAX_DISTANCE;
      const rawY = thumbY.value / MAX_DISTANCE;
      runOnJS(emitMove)(applyDeadZone(rawX, sensitivity), applyDeadZone(rawY, sensitivity));
    })
    .onEnd(() => {
      thumbX.value = withSpring(0, { damping: 15, stiffness: 300 });
      thumbY.value = withSpring(0, { damping: 15, stiffness: 300 });
      baseOpacity.value = withTiming(0, { duration: 300 });
      borderOpacity.value = withTiming(0.15, { duration: 300 });
      thumbGlowOpacity.value = withTiming(0.4, { duration: 300 });
      runOnJS(emitMove)(0, 0);
    })
    .minDistance(0);

  const baseStyle = useAnimatedStyle(() => ({
    opacity: baseOpacity.value,
    transform: [
      { translateX: baseX.value - BASE_SIZE / 2 },
      { translateY: baseY.value - BASE_SIZE / 2 },
    ],
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: thumbX.value },
      { translateY: thumbY.value },
    ],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(155,107,190,${borderOpacity.value})`,
  }));

  const thumbShadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: thumbGlowOpacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.zone}>
        <Animated.View style={[styles.base, baseStyle]}>
          <Animated.View style={[styles.baseInner, borderStyle]}>
            <Animated.View style={[styles.thumb, thumbStyle]}>
              {/* Gradient thumb matching web: radial-gradient(circle at 35% 30%,
                  rgba(155,107,190,0.35), rgba(92,196,176,0.15)) */}
              <Animated.View style={[styles.thumbOuter, thumbShadowStyle]}>
                <LinearGradient
                  colors={['rgba(155,107,190,0.45)', 'rgba(92,196,176,0.20)']}
                  start={{ x: 0.35, y: 0.3 }}
                  end={{ x: 0.8, y: 0.9 }}
                  style={styles.thumbGradient}
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  zone: {
    flex: 1,
    position: 'relative',
  },
  base: {
    position: 'absolute',
    width: BASE_SIZE,
    height: BASE_SIZE,
  },
  baseInner: {
    width: BASE_SIZE,
    height: BASE_SIZE,
    borderRadius: BASE_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(155,107,190,0.15)',
    backgroundColor: 'rgba(155,107,190,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOuter: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(155,107,190,0.3)',
    overflow: 'hidden',
    // Glow matching web joystick thumb
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  thumbGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: THUMB_SIZE / 2,
  },
});
