import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, runOnJS, SharedValue } from 'react-native-reanimated';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple } from 'phosphor-react-native';
import { ButtonVisual, ActionButtonConfig, BUTTON_SIZE } from './ActionButton';
import { playHaptic } from '../controller/haptics';
import { Colors } from '../theme/colors';

const BUTTON_GAP = 8;

const BUTTONS: ActionButtonConfig[] = [
  {
    name: 'throw',
    icon: <ArrowsOutSimple size={36} color="#fff" weight="bold" />,
    colors: [Colors.blue, Colors.blueDeep],
    glowColor: 'rgba(107,139,208,0.6)',
  },
  {
    name: 'punch',
    icon: <HandFist size={36} color="#fff" weight="bold" />,
    colors: [Colors.pink, Colors.pinkDeep],
    glowColor: 'rgba(200,120,168,0.6)',
  },
  {
    name: 'bomb',
    icon: <FireSimple size={36} color="#fff" weight="bold" />,
    colors: [Colors.gold, Colors.goldDim],
    glowColor: 'rgba(232,200,64,0.6)',
  },
  {
    name: 'jump',
    icon: <ArrowUp size={36} color="#fff" weight="bold" />,
    colors: [Colors.teal, Colors.tealDeep],
    glowColor: 'rgba(92,196,176,0.6)',
  },
];

function useButtonAnim() {
  return { scale: useSharedValue(1), pressed: useSharedValue(0) };
}

function createGesture(
  scale: SharedValue<number>,
  pressed: SharedValue<number>,
  onPress: () => void,
  onRelease: () => void,
) {
  return Gesture.Manual()
    .onTouchesDown(() => {
      scale.value = withSpring(0.85, { damping: 15, stiffness: 400 });
      pressed.value = withTiming(1, { duration: 50 });
      runOnJS(onPress)();
    })
    .onTouchesUp(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(onRelease)();
    })
    .onTouchesCancelled(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(onRelease)();
    })
    .shouldCancelWhenOutside(false);
}

interface ActionButtonsProps {
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
  hapticsEnabled?: boolean;
}

export function ActionButtons({ onPressIn, onPressOut, hapticsEnabled = true }: ActionButtonsProps) {
  const b0 = useButtonAnim(); // throw (top)
  const b1 = useButtonAnim(); // punch (left)
  const b2 = useButtonAnim(); // bomb  (right)
  const b3 = useButtonAnim(); // jump  (bottom)

  const press = useCallback((name: string) => {
    playHaptic(name, hapticsEnabled, 'medium');
    onPressIn(name);
  }, [hapticsEnabled, onPressIn]);

  const release = useCallback((name: string) => {
    onPressOut(name);
  }, [onPressOut]);

  const g0 = createGesture(b0.scale, b0.pressed, () => press('throw'),  () => release('throw'));
  const g1 = createGesture(b1.scale, b1.pressed, () => press('punch'),  () => release('punch'));
  const g2 = createGesture(b2.scale, b2.pressed, () => press('bomb'),   () => release('bomb'));
  const g3 = createGesture(b3.scale, b3.pressed, () => press('jump'),   () => release('jump'));

  // Two layers:
  //   1. Tap zones — invisible, fill all space (quadrants)
  //   2. Visual diamond — tight cluster centered, passes touches through
  return (
    <View style={styles.container}>
      {/* Layer 1: Tap zones (quadrants of the full area) */}
      <View style={styles.tapLayer}>
        <GestureDetector gesture={g0}>
          <Animated.View style={styles.topZone} />
        </GestureDetector>
        <View style={styles.midZones}>
          <GestureDetector gesture={g1}>
            <Animated.View style={styles.leftZone} />
          </GestureDetector>
          <GestureDetector gesture={g2}>
            <Animated.View style={styles.rightZone} />
          </GestureDetector>
        </View>
        <GestureDetector gesture={g3}>
          <Animated.View style={styles.bottomZone} />
        </GestureDetector>
      </View>

      {/* Layer 2: Visual buttons — tight diamond, no touch handling */}
      <View style={styles.visualLayer} pointerEvents="none">
        <View style={styles.diamondTop}>
          <ButtonVisual config={BUTTONS[0]} scale={b0.scale} pressed={b0.pressed} />
        </View>
        <View style={styles.diamondMid}>
          <ButtonVisual config={BUTTONS[1]} scale={b1.scale} pressed={b1.pressed} />
          <ButtonVisual config={BUTTONS[2]} scale={b2.scale} pressed={b2.pressed} />
        </View>
        <View style={styles.diamondBottom}>
          <ButtonVisual config={BUTTONS[3]} scale={b3.scale} pressed={b3.pressed} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // --- Tap zones: fill all available space ---
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topZone: {
    flex: 1,
  },
  midZones: {
    flex: 1,
    flexDirection: 'row',
  },
  leftZone: {
    flex: 1,
  },
  rightZone: {
    flex: 1,
  },
  bottomZone: {
    flex: 1,
  },
  // --- Visual diamond: centered, compact ---
  visualLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: BUTTON_GAP,
  },
  diamondTop: {
    alignItems: 'center',
  },
  diamondMid: {
    flexDirection: 'row',
    gap: BUTTON_GAP,
  },
  diamondBottom: {
    alignItems: 'center',
  },
});
