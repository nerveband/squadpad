import { memo, useCallback, useEffect, useMemo } from 'react';
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
const COMPACT_BASE_SIZE = 116;
const COMPACT_THUMB_SIZE = 48;
const RADIAL_DEAD_ZONE = 0.07; // Small radial deadzone; no per-axis cross lock

export type JoystickStyle = 'floating' | 'fixed';

interface JoystickProps {
  onMove: (x: number, y: number, rimRun?: boolean) => void;
  sensitivity?: number; // 0.5 to 2.0, default 1.0
  /** floating: the stick centres where the thumb lands. fixed: it stays put. */
  mode?: JoystickStyle;
  /** True when the joystick zone is on the right side (left-handed layout). */
  mirrored?: boolean;
  /** Engage Run when stick deflection reaches the outer rim (>= 88%). */
  stickEdgeRun?: boolean;
  /** Compact sizing for narrow portrait screens. */
  compact?: boolean;
}

// Opacity of the joystick at rest. Floating shows a dim ghost so players know
// where to put their thumb; fixed stays fully visible because it doesn't move.
const REST_OPACITY: Record<JoystickStyle, number> = { floating: 0.35, fixed: 0.8 };

function computeRestPosition(width: number, height: number, mirrored: boolean, compact: boolean) {
  'worklet';
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0 };
  }
  const baseSize = compact ? COMPACT_BASE_SIZE : BASE_SIZE;
  if (compact) {
    return {
      x: width * 0.5,
      y: Math.max(baseSize / 2 + 12, height - 126),
    };
  }
  const edgeOffset = Math.min(width * 0.5, 130);
  const x = mirrored ? width - edgeOffset : edgeOffset;
  const y = Math.min(Math.max(height * 0.56, baseSize / 2 + 12), Math.max(baseSize / 2 + 12, height - 125));
  return { x, y };
}

export const Joystick = memo(function Joystick({
  onMove,
  sensitivity = 1.0,
  mode = 'floating',
  mirrored = false,
  stickEdgeRun = false,
  compact = false,
}: JoystickProps) {
  const baseSize = compact ? COMPACT_BASE_SIZE : BASE_SIZE;
  const thumbSize = compact ? COMPACT_THUMB_SIZE : THUMB_SIZE;
  const maxDistance = (baseSize - thumbSize) / 2;
  const zoneW = useSharedValue(0);
  const zoneH = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const thumbX = useSharedValue(0);
  const thumbY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const activeTouchId = useSharedValue(-1);
  const isRunning = useSharedValue(false);
  const baseOpacity = useSharedValue(REST_OPACITY[mode]);
  const borderOpacity = useSharedValue(0.15);
  const thumbGlowOpacity = useSharedValue(0.4);
  const restOpacity = REST_OPACITY[mode];
  const floating = mode === 'floating';
  // Last position sent to JS, quantised to the wire format (h * 512 + v * 2 + run).
  const lastStep = useSharedValue(-1);

  const emitMove = useCallback(
    (x: number, y: number, rimRun?: boolean) => {
      onMove(x, y, rimRun);
    },
    [onMove],
  );

  const moveThumb = (touchX: number, touchY: number) => {
    'worklet';
    let dx = touchX - baseX.value;
    let dy = touchY - baseY.value;
    let dist = Math.sqrt(dx * dx + dy * dy);

    // Official BombSquad Remote floating behavior (`RemoteViewController.mm`):
    // when the thumb drags past the rim in floating mode, pull the base along
    // behind the thumb so reversing direction turns the character immediately
    // with zero wasted travel back across the screen.
    if (floating && dist > maxDistance) {
      const pullScale = maxDistance / dist;
      baseX.value = touchX - dx * pullScale;
      baseY.value = touchY - dy * pullScale;
      dx = touchX - baseX.value;
      dy = touchY - baseY.value;
      dist = maxDistance;
    }

    const visualScale = dist > maxDistance ? maxDistance / dist : 1;
    thumbX.value = dx * visualScale;
    thumbY.value = dy * visualScale;

    // Reach full speed inside a tighter radius (`0.70 * maxDistance`) scaled by
    // sensitivity and capped at `0.95 * maxDistance` so full speed is always
    // reachable even at low sensitivity (0.5) when floating pull-follow clamps `dist`.
    const fullSpeedDist = Math.max(
      10,
      Math.min(maxDistance * 0.95, ((floating ? 0.70 : 0.82) * maxDistance) / sensitivity),
    );
    const rawMag = dist / fullSpeedDist;
    let x = 0;
    let y = 0;
    if (rawMag > RADIAL_DEAD_ZONE && dist > 0) {
      const normMag = (rawMag - RADIAL_DEAD_ZONE) / (1 - RADIAL_DEAD_ZONE);
      const unitX = (dx / dist) * normMag;
      const unitY = (dy / dist) * normMag;
      // Clamp to unit box [-1, 1] like RemoteViewController.mm (`setDPadX:andY:`)
      let hx = unitX;
      let vy = unitY;
      if (Math.abs(hx) > 1) {
        const m = 1 / Math.abs(hx);
        hx *= m;
        vy *= m;
      }
      if (Math.abs(vy) > 1) {
        const m = 1 / Math.abs(vy);
        hx *= m;
        vy *= m;
      }
      x = Math.max(-1, Math.min(1, hx));
      y = Math.max(-1, Math.min(1, vy));
    }

    const rimRun = stickEdgeRun ? dist >= maxDistance * 0.88 : false;
    isRunning.value = rimRun;

    const step =
      Math.round((x + 1) * 127.5) * 512 +
      Math.round((y + 1) * 127.5) * 2 +
      (rimRun ? 1 : 0);
    if (step === lastStep.value) return;
    lastStep.value = step;
    runOnJS(emitMove)(x, y, stickEdgeRun ? rimRun : undefined);
  };

  const restAt = () => {
    'worklet';
    const pos = computeRestPosition(zoneW.value, zoneH.value, mirrored, compact);
    baseX.value = pos.x;
    baseY.value = pos.y;
  };

  const finishTouch = () => {
    'worklet';
    activeTouchId.value = -1;
    isActive.value = false;
    thumbX.value = withSpring(0, { damping: 15, stiffness: 300 });
    thumbY.value = withSpring(0, { damping: 15, stiffness: 300 });
    if (floating) restAt();
    baseOpacity.value = withTiming(restOpacity, { duration: 300 });
    borderOpacity.value = withTiming(0.15, { duration: 300 });
    thumbGlowOpacity.value = withTiming(0.4, { duration: 300 });
    lastStep.value = -1;
    isRunning.value = false;
    runOnJS(emitMove)(0, 0, stickEdgeRun ? false : undefined);
  };

  // Manual gesture with explicit touch-ID ownership so a second finger or palm
  // brush in the joystick zone never averages or steals the active thumb coordinates.
  const pan = useMemo(
    () =>
      Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      if (activeTouchId.value !== -1) return;
      const t = e.changedTouches[0];
      if (!t) return;
      activeTouchId.value = t.id;
      isActive.value = true;
      if (floating) {
        baseX.value = t.x;
        baseY.value = t.y;
        thumbX.value = 0;
        thumbY.value = 0;
      } else {
        moveThumb(t.x, t.y);
      }
      baseOpacity.value = withTiming(1, { duration: 80 });
      borderOpacity.value = withTiming(0.4, { duration: 80 });
      thumbGlowOpacity.value = withTiming(0.8, { duration: 80 });
    })
    .onTouchesMove((e) => {
      'worklet';
      const id = activeTouchId.value;
      if (id === -1) return;
      for (const t of e.changedTouches) {
        if (t.id === id) {
          moveThumb(t.x, t.y);
          break;
        }
      }
    })
    .onTouchesUp((e) => {
      'worklet';
      const id = activeTouchId.value;
      if (id === -1) return;
      for (const t of e.changedTouches) {
        if (t.id === id) {
          finishTouch();
          break;
        }
      }
    })
    .onTouchesCancelled((e) => {
      'worklet';
      const id = activeTouchId.value;
      if (id === -1) return;
      for (const t of e.changedTouches) {
        if (t.id === id) {
          finishTouch();
          break;
        }
      }
        })
        .shouldCancelWhenOutside(false),
    [floating, sensitivity, stickEdgeRun, maxDistance, restOpacity, mirrored, compact, emitMove],
  );
  // Re-centre and fade to the new resting opacity when mode or handedness changes.
  useEffect(() => {
    if (zoneW.value > 0 && !isActive.value) {
      const pos = computeRestPosition(zoneW.value, zoneH.value, mirrored, compact);
      baseX.value = pos.x;
      baseY.value = pos.y;
    }
    baseOpacity.value = withTiming(REST_OPACITY[mode], { duration: 200 });
  }, [mode, mirrored, compact, baseX, baseY, baseOpacity, zoneW, zoneH, isActive]);

  const baseStyle = useAnimatedStyle(() => ({
    opacity: baseOpacity.value,
    transform: [
      { translateX: baseX.value - baseSize / 2 },
      { translateY: baseY.value - baseSize / 2 },
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
          // Guard against mid-drag resizes (such as Live Activity expansion in the
          // iPhone Duo rail or foldable posture changes) so the base never jumps
          // away from an active thumb.
          if (!isActive.value) {
            const pos = computeRestPosition(width, height, mirrored, compact);
            baseX.value = pos.x;
            baseY.value = pos.y;
          } else {
            const half = baseSize / 2;
            baseX.value = Math.max(half, Math.min(width - half, baseX.value));
            baseY.value = Math.max(half, Math.min(height - half, baseY.value));
          }
        }}
      >
        <Animated.View style={[styles.base, { width: baseSize, height: baseSize }, baseStyle]}>
          <Animated.View
            style={[
              styles.baseInner,
              { width: baseSize, height: baseSize, borderRadius: baseSize / 2 },
              borderStyle,
            ]}
          >
            <Animated.View
              style={[
                styles.thumb,
                { width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2 },
                thumbStyle,
              ]}
            >
              <Animated.View
                style={[
                  styles.thumbOuter,
                  { width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2 },
                  thumbShadowStyle,
                ]}
              >
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
});

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
