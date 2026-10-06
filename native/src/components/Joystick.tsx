import { useEffect } from 'react';
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

export type JoystickStyle = 'floating' | 'fixed';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  sensitivity?: number; // 0.5 to 2.0, default 1.0
  /** floating: the stick centres where the thumb lands. fixed: it stays put. */
  mode?: JoystickStyle;
}

// Opacity of the joystick at rest. Floating shows a dim ghost so players know
// where to put their thumb; fixed stays fully visible because it doesn't move.
const REST_OPACITY: Record<JoystickStyle, number> = { floating: 0.35, fixed: 0.8 };

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

export function Joystick({ onMove, sensitivity = 1.0, mode = 'floating' }: JoystickProps) {
  const zoneW = useSharedValue(0);
  const zoneH = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const thumbX = useSharedValue(0);
  const thumbY = useSharedValue(0);
  const baseOpacity = useSharedValue(REST_OPACITY[mode]);
  const borderOpacity = useSharedValue(0.15);
  const thumbGlowOpacity = useSharedValue(0.4);
  const restOpacity = REST_OPACITY[mode];
  const floating = mode === 'floating';
  // Last position sent to JS, quantised to the wire format (h * 256 + v).
  const lastStep = useSharedValue(-1);

  const emitMove = (x: number, y: number) => {
    onMove(x, y);
  };

  const moveThumb = (touchX: number, touchY: number) => {
    'worklet';
    const dx = touchX - baseX.value;
    const dy = touchY - baseY.value;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist > MAX_DISTANCE ? MAX_DISTANCE / dist : 1;
    thumbX.value = dx * scale;
    thumbY.value = dy * scale;
    const x = applyDeadZone(thumbX.value / MAX_DISTANCE, sensitivity);
    const y = applyDeadZone(thumbY.value / MAX_DISTANCE, sensitivity);
    // Touch moves arrive at 60-120 Hz; only cross to JS when the value the
    // game receives (256 steps per axis) actually changes.
    const step = Math.round((x + 1) * 127.5) * 256 + Math.round((y + 1) * 127.5);
    if (step === lastStep.value) return;
    lastStep.value = step;
    runOnJS(emitMove)(x, y);
  };

  const restAt = () => {
    'worklet';
    baseX.value = zoneW.value / 2;
    baseY.value = zoneH.value * 0.55;
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      if (floating) {
        baseX.value = e.x;
        baseY.value = e.y;
        thumbX.value = 0;
        thumbY.value = 0;
      } else {
        moveThumb(e.x, e.y);
      }
      baseOpacity.value = withTiming(1, { duration: 100 });
      borderOpacity.value = withTiming(0.4, { duration: 100 });
      thumbGlowOpacity.value = withTiming(0.8, { duration: 100 });
    })
    .onUpdate((e) => {
      moveThumb(e.x, e.y);
    })
    .onFinalize(() => {
      thumbX.value = withSpring(0, { damping: 15, stiffness: 300 });
      thumbY.value = withSpring(0, { damping: 15, stiffness: 300 });
      if (floating) restAt();
      baseOpacity.value = withTiming(restOpacity, { duration: 300 });
      borderOpacity.value = withTiming(0.15, { duration: 300 });
      thumbGlowOpacity.value = withTiming(0.4, { duration: 300 });
      lastStep.value = -1;
      runOnJS(emitMove)(0, 0);
    })
    .minDistance(0);

  // Re-centre and fade to the new resting opacity when the mode changes.
  useEffect(() => {
    baseX.value = zoneW.value / 2;
    baseY.value = zoneH.value * 0.55;
    baseOpacity.value = withTiming(REST_OPACITY[mode], { duration: 200 });
  }, [mode, baseX, baseY, baseOpacity, zoneW, zoneH]);

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
      <View
        style={styles.zone}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          zoneW.value = width;
          zoneH.value = height;
          baseX.value = width / 2;
          baseY.value = height * 0.55;
        }}
      >
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
    // Glow matching web joystick thumb (iOS). No Android `elevation`: on a
    // translucent view it draws a dark polygon through the thumb.
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  thumbGradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: THUMB_SIZE / 2,
  },
});
