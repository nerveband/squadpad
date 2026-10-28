import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple, PersonSimpleRun } from 'phosphor-react-native';
import { ButtonVisual, ActionButtonConfig, BUTTON_SIZE } from './ActionButton';
import { playHaptic, type HapticIntensity } from '../controller/haptics';
import type { ButtonName } from '../controller/controller-state';
import { getZone } from '../controller/touch-zones';
import type { RunMode } from '../hooks/useSettings';
import { Colors } from '../theme/colors';
import { Fonts, FontSize, FontWeight } from '../theme/typography';
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

export { getZone };

function useButtonAnim() {
  return { scale: useSharedValue(1), pressed: useSharedValue(0) };
}

interface ActionButtonsProps {
  onPressIn: (name: ButtonName) => void;
  onPressOut: (name: ButtonName) => void;
  hapticsEnabled: boolean;
  hapticIntensity: HapticIntensity;
  runMode?: RunMode;
  /** True when action buttons sit on the left side (left-handed layout). */
  mirrored?: boolean;
}

export function ActionButtons({
  onPressIn,
  onPressOut,
  hapticsEnabled,
  hapticIntensity,
  runMode = 'buttonHold',
  mirrored = false,
}: ActionButtonsProps) {
  const b0 = useButtonAnim(); // throw (top)
  const b1 = useButtonAnim(); // punch (left)
  const b2 = useButtonAnim(); // bomb  (right)
  const b3 = useButtonAnim(); // jump  (bottom)
  const [runBtnPressed, setRunBtnPressed] = useState(false);

  const layoutW = useSharedValue(0);
  const layoutH = useSharedValue(0);
  const clusterCenterX = useSharedValue(0);
  const clusterCenterY = useSharedValue(0);
  const clusterMaxRadius = useSharedValue(0);

  // Map of touchId -> zone index for multi-touch chording and slide rollover
  const activeTouches = useRef(new Map<number, number>());
  const runHeldByActionRef = useRef(false);

  const isZoneHeld = (zone: number): boolean => {
    for (const z of activeTouches.current.values()) {
      if (z === zone) return true;
    }
    return false;
  };

  const syncButtonHoldRun = useCallback(() => {
    if (runMode !== 'buttonHold') {
      if (runHeldByActionRef.current) {
        runHeldByActionRef.current = false;
        onPressOut('run');
      }
      return;
    }
    const anyActive = activeTouches.current.size > 0;
    if (anyActive && !runHeldByActionRef.current) {
      runHeldByActionRef.current = true;
      onPressIn('run');
    } else if (!anyActive && runHeldByActionRef.current) {
      runHeldByActionRef.current = false;
      onPressOut('run');
    }
  }, [runMode, onPressIn, onPressOut]);

  useEffect(() => {
    syncButtonHoldRun();
  }, [syncButtonHoldRun]);

  const pressZone = useCallback((zone: number) => {
    const scales = [b0.scale, b1.scale, b2.scale, b3.scale];
    const presseds = [b0.pressed, b1.pressed, b2.pressed, b3.pressed];
    scales[zone].value = withSpring(0.85, { damping: 15, stiffness: 400 });
    presseds[zone].value = withTiming(1, { duration: 50 });
    playHaptic(BUTTON_NAMES[zone], hapticsEnabled, hapticIntensity);
    onPressIn(BUTTON_NAMES[zone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hapticsEnabled, hapticIntensity, onPressIn]);

  const releaseZone = useCallback((zone: number) => {
    const scales = [b0.scale, b1.scale, b2.scale, b3.scale];
    const presseds = [b0.pressed, b1.pressed, b2.pressed, b3.pressed];
    scales[zone].value = withSpring(1, { damping: 12, stiffness: 280 });
    presseds[zone].value = withTiming(0, { duration: 180 });
    onPressOut(BUTTON_NAMES[zone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPressOut]);

  const resolveZone = useCallback((x: number, y: number): number => {
    const cx = clusterCenterX.value > 0 ? clusterCenterX.value : layoutW.value / 2;
    const cy = clusterCenterY.value > 0 ? clusterCenterY.value : layoutH.value / 2;
    return getZone(x, y, cx, cy, clusterMaxRadius.value);
  }, [clusterCenterX, clusterCenterY, clusterMaxRadius, layoutW, layoutH]);

  const handleDown = useCallback((id: number, x: number, y: number) => {
    const zone = resolveZone(x, y);
    if (zone < 0) return;
    const alreadyHeld = isZoneHeld(zone);
    activeTouches.current.set(id, zone);
    if (!alreadyHeld) {
      pressZone(zone);
    }
    syncButtonHoldRun();
  }, [resolveZone, pressZone, syncButtonHoldRun]);

  // Thumb slide / rollover: sliding a finger from Jump to Punch or Bomb smoothly
  // releases the previous button and triggers the new one without lifting the thumb.
  const handleMove = useCallback((id: number, x: number, y: number) => {
    const prevZone = activeTouches.current.get(id);
    if (prevZone == null) return;
    const nextZone = resolveZone(x, y);
    if (nextZone === prevZone) return;

    activeTouches.current.delete(id);
    if (!isZoneHeld(prevZone)) {
      releaseZone(prevZone);
    }

    if (nextZone >= 0) {
      const alreadyHeld = isZoneHeld(nextZone);
      activeTouches.current.set(id, nextZone);
      if (!alreadyHeld) {
        pressZone(nextZone);
      }
    }
    syncButtonHoldRun();
  }, [resolveZone, pressZone, releaseZone, syncButtonHoldRun]);

  const handleUp = useCallback((id: number) => {
    const zone = activeTouches.current.get(id);
    if (zone == null) return;
    activeTouches.current.delete(id);
    if (!isZoneHeld(zone)) {
      releaseZone(zone);
    }
    syncButtonHoldRun();
  }, [releaseZone, syncButtonHoldRun]);

  const gesture = Gesture.Manual()
    .onTouchesDown((e) => {
      for (const t of e.changedTouches) {
        runOnJS(handleDown)(t.id, t.x, t.y);
      }
    })
    .onTouchesMove((e) => {
      for (const t of e.changedTouches) {
        runOnJS(handleMove)(t.id, t.x, t.y);
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
        const { width, height } = e.nativeEvent.layout;
        layoutW.value = width;
        layoutH.value = height;
      }}
    >
      {/* Single gesture zone: diagonal quadrants + slide rollover */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Visual diamond anchored in the ergonomic outer-bottom thumb arc */}
      <View
        style={[
          styles.visualLayer,
          mirrored ? styles.visualLayerMirrored : styles.visualLayerStandard,
        ]}
        pointerEvents="box-none"
      >
        <View
          style={styles.diamondCluster}
          pointerEvents="none"
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            clusterCenterX.value = x + width / 2;
            clusterCenterY.value = y + height / 2;
            // Generous thumb radius around the diamond, capped on wide screens
            // so stray touches near the foldable center crease are ignored.
            clusterMaxRadius.value = Math.max(width, height) * 0.85;
          }}
        >
          <ButtonVisual config={BUTTONS[0]} scale={b0.scale} pressed={b0.pressed} />
          <View style={styles.diamondMidRow}>
            <ButtonVisual config={BUTTONS[1]} scale={b1.scale} pressed={b1.pressed} />
            <ButtonVisual config={BUTTONS[2]} scale={b2.scale} pressed={b2.pressed} />
          </View>
          <ButtonVisual config={BUTTONS[3]} scale={b3.scale} pressed={b3.pressed} />
        </View>

        {runMode === 'button' && (
          <Pressable
            onPressIn={() => {
              setRunBtnPressed(true);
              playHaptic('run', hapticsEnabled, hapticIntensity);
              onPressIn('run');
            }}
            onPressOut={() => {
              setRunBtnPressed(false);
              onPressOut('run');
            }}
            style={[
              styles.runBtn,
              mirrored ? styles.runBtnMirrored : styles.runBtnStandard,
              runBtnPressed && styles.runBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Hold to run"
          >
            <PersonSimpleRun size={18} color="#fff" weight="bold" />
            <Text style={styles.runBtnText}>RUN</Text>
          </Pressable>
        )}
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
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  visualLayerStandard: {
    alignItems: 'flex-end',
  },
  visualLayerMirrored: {
    alignItems: 'flex-start',
  },
  diamondCluster: {
    alignItems: 'center',
    gap: BUTTON_GAP,
  },
  diamondMidRow: {
    flexDirection: 'row',
    gap: MID_GAP,
  },
  runBtn: {
    position: 'absolute',
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(92,196,176,0.45)',
    backgroundColor: 'rgba(58,154,136,0.28)',
  },
  runBtnStandard: {
    right: 16,
  },
  runBtnMirrored: {
    left: 16,
  },
  runBtnPressed: {
    backgroundColor: 'rgba(92,196,176,0.65)',
    borderColor: '#fff',
    transform: [{ scale: 0.92 }],
  },
  runBtnText: {
    fontFamily: Fonts.bold,
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
});
