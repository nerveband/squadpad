import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple } from 'phosphor-react-native';
import { ButtonVisual, ActionButtonConfig, BUTTON_SIZE } from './ActionButton';
import { playHaptic } from '../controller/haptics';
import { Colors } from '../theme/colors';

const BUTTON_GAP = 14;
// Horizontal gap between punch & bomb — wider than vertical gap
// so the diamond looks balanced rather than squished.
const MID_GAP = BUTTON_SIZE * 0.55;

const BUTTON_NAMES = ['throw', 'punch', 'bomb', 'jump'] as const;

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

/**
 * Determine which diamond quadrant a touch falls in by drawing
 * an X through the center of the container.
 *
 *         0 (throw)
 *       /   \
 *   1 (punch) 2 (bomb)
 *       \   /
 *         3 (jump)
 *
 * Returns 0-3 or -1 if container has no size.
 */
function getZone(x: number, y: number, w: number, h: number): number {
  if (w === 0 || h === 0) return -1;
  // Normalize to [-0.5, 0.5] so aspect ratio is accounted for
  const dx = (x - w / 2) / w;
  const dy = (y - h / 2) / h;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 0 : 3; // top → throw, bottom → jump
  }
  return dx < 0 ? 1 : 2; // left → punch, right → bomb
}

function useButtonAnim() {
  return { scale: useSharedValue(1), pressed: useSharedValue(0) };
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

  const layoutW = useSharedValue(1);
  const layoutH = useSharedValue(1);

  // Map of touchId → zone index for multi-touch tracking
  const activeTouches = useRef(new Map<number, number>());

  const pressZone = useCallback((zone: number) => {
    const scales = [b0.scale, b1.scale, b2.scale, b3.scale];
    const presseds = [b0.pressed, b1.pressed, b2.pressed, b3.pressed];
    scales[zone].value = withSpring(0.85, { damping: 15, stiffness: 400 });
    presseds[zone].value = withTiming(1, { duration: 50 });
    playHaptic(BUTTON_NAMES[zone], hapticsEnabled, 'medium');
    onPressIn(BUTTON_NAMES[zone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hapticsEnabled, onPressIn]);

  const releaseZone = useCallback((zone: number) => {
    const scales = [b0.scale, b1.scale, b2.scale, b3.scale];
    const presseds = [b0.pressed, b1.pressed, b2.pressed, b3.pressed];
    scales[zone].value = withSpring(1, { damping: 12, stiffness: 280 });
    presseds[zone].value = withTiming(0, { duration: 180 });
    onPressOut(BUTTON_NAMES[zone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPressOut]);

  const handleDown = useCallback((id: number, x: number, y: number) => {
    const zone = getZone(x, y, layoutW.value, layoutH.value);
    if (zone < 0) return;
    activeTouches.current.set(id, zone);
    pressZone(zone);
  }, [pressZone, layoutW, layoutH]);

  const handleUp = useCallback((id: number) => {
    const zone = activeTouches.current.get(id);
    if (zone == null) return;
    activeTouches.current.delete(id);
    releaseZone(zone);
  }, [releaseZone]);

  const gesture = Gesture.Manual()
    .onTouchesDown((e) => {
      for (const t of e.changedTouches) {
        runOnJS(handleDown)(t.id, t.x, t.y);
      }
    })
    .onTouchesUp((e) => {
      for (const t of e.changedTouches) {
        runOnJS(handleUp)(t.id);
      }
    })
    .onTouchesCancelled((e) => {
      for (const t of e.changedTouches) {
        runOnJS(handleUp)(t.id);
      }
    })
    .shouldCancelWhenOutside(false);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        layoutW.value = e.nativeEvent.layout.width;
        layoutH.value = e.nativeEvent.layout.height;
      }}
    >
      {/* Single gesture zone — diagonal quadrants via getZone() */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Visual diamond (touch-transparent) */}
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
    gap: MID_GAP,
  },
});
