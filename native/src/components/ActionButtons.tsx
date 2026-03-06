import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, runOnJS, SharedValue } from 'react-native-reanimated';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple } from 'phosphor-react-native';
import { ButtonVisual, ActionButtonConfig, BUTTON_SIZE } from './ActionButton';
import { playHaptic } from '../controller/haptics';
import { Colors } from '../theme/colors';

const BUTTON_GAP = 6;

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

  //
  // Two-layer architecture:
  //
  //   Layer 1 (bottom): Tap zones — invisible View quadrants that fill
  //   the entire container. Each quadrant has a GestureDetector so you
  //   can slap anywhere in the zone to hit the button.
  //
  //   Layer 2 (top): Visual diamond — a tight cluster of 82px circles
  //   with 6px gaps, centered. pointerEvents="none" so touches fall
  //   through to the tap zones beneath.
  //
  return (
    <View style={styles.container}>
      {/* Layer 1: Tap zones */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.topZone}>
          <GestureDetector gesture={g0}>
            <Animated.View style={StyleSheet.absoluteFill} />
          </GestureDetector>
        </View>
        <View style={styles.midZones}>
          <View style={styles.halfZone}>
            <GestureDetector gesture={g1}>
              <Animated.View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          </View>
          <View style={styles.halfZone}>
            <GestureDetector gesture={g2}>
              <Animated.View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          </View>
        </View>
        <View style={styles.bottomZone}>
          <GestureDetector gesture={g3}>
            <Animated.View style={StyleSheet.absoluteFill} />
          </GestureDetector>
        </View>
      </View>

      {/* Layer 2: Visual diamond (tight, centered, touch-transparent) */}
      <View style={styles.visualLayer} pointerEvents="none">
        <View style={styles.diamondCluster}>
          <ButtonVisual config={BUTTONS[0]} scale={b0.scale} pressed={b0.pressed} />
          <View style={styles.diamondMidRow}>
            <ButtonVisual config={BUTTONS[1]} scale={b1.scale} pressed={b1.pressed} />
            <ButtonVisual config={BUTTONS[2]} scale={b2.scale} pressed={b2.pressed} />
          </View>
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
  // --- Tap zone quadrants ---
  topZone: {
    flex: 1,
  },
  midZones: {
    flex: 1,
    flexDirection: 'row',
  },
  halfZone: {
    flex: 1,
  },
  bottomZone: {
    flex: 1,
  },
  // --- Visual diamond (centered cluster) ---
  visualLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diamondCluster: {
    alignItems: 'center',
    gap: BUTTON_GAP,
  },
  diamondMidRow: {
    flexDirection: 'row',
    gap: BUTTON_GAP,
  },
});
