import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { ArrowUp, HandFist, FireSimple, ArrowsOutSimple, PersonSimpleRun } from 'phosphor-react-native';
import { ButtonVisual, ActionButtonConfig, BUTTON_SIZE, COMPACT_BUTTON_SIZE } from './ActionButton';
import { playHaptic, type HapticIntensity } from '../controller/haptics';
import type { ButtonName } from '../controller/controller-state';
import { getZone, getButtonMask } from '../controller/touch-zones';
import type { RunMode } from '../hooks/useSettings';
import { Colors } from '../theme/colors';
import { Fonts, FontSize, FontWeight } from '../theme/typography';

const BUTTON_GAP = 14;
const COMPACT_BUTTON_GAP = 8;
// Horizontal gap between punch & bomb — wider than vertical gap
// so the diamond looks balanced rather than squished.
const MID_GAP = Math.round(BUTTON_SIZE * 0.52);
const COMPACT_MID_GAP = 28;
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
  /** Use compact diamond sizing for narrow portrait screens. */
  compact?: boolean;
}

export function ActionButtons({
  onPressIn,
  onPressOut,
  hapticsEnabled,
  hapticIntensity,
  runMode = 'stickEdge',
  mirrored = false,
  compact = false,
}: ActionButtonsProps) {
  const b0 = useButtonAnim(); // throw (top, bit 0)
  const b1 = useButtonAnim(); // punch (left, bit 1)
  const b2 = useButtonAnim(); // bomb  (right, bit 2)
  const b3 = useButtonAnim(); // jump  (bottom, bit 3)
  const [runBtnPressed, setRunBtnPressed] = useState(false);

  const btnSize = compact ? COMPACT_BUTTON_SIZE : BUTTON_SIZE;
  const midGap = compact ? COMPACT_MID_GAP : MID_GAP;
  const btnGap = compact ? COMPACT_BUTTON_GAP : BUTTON_GAP;
  const sepX = (btnSize + midGap) / 2;
  const sepY = btnSize + btnGap;

  const layoutW = useSharedValue(0);
  const layoutH = useSharedValue(0);
  const clusterCenterX = useSharedValue(0);
  const clusterCenterY = useSharedValue(0);
  const clusterMaxRadius = useSharedValue(0);

  // UI-thread touch tracking (up to 8 simultaneous touches in the button zone)
  const touchIds = useSharedValue<number[]>([-1, -1, -1, -1, -1, -1, -1, -1]);
  const touchMasks = useSharedValue<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const currentMask = useSharedValue(0);
  const runHeldByActionRef = useRef(false);

  // Sync JS button state + haptics only when the 4-bit mask actually changes.
  const applyMaskChange = useCallback(
    (nextMask: number, prevMask: number) => {
      for (let i = 0; i < 4; i++) {
        const bit = 1 << i;
        const wasDown = (prevMask & bit) !== 0;
        const isDown = (nextMask & bit) !== 0;
        if (!wasDown && isDown) {
          playHaptic(BUTTON_NAMES[i], hapticsEnabled, hapticIntensity);
          onPressIn(BUTTON_NAMES[i]);
        } else if (wasDown && !isDown) {
          onPressOut(BUTTON_NAMES[i]);
        }
      }

      if (runMode === 'buttonHold') {
        const anyActive = nextMask !== 0;
        if (anyActive && !runHeldByActionRef.current) {
          runHeldByActionRef.current = true;
          onPressIn('run');
        } else if (!anyActive && runHeldByActionRef.current) {
          runHeldByActionRef.current = false;
          onPressOut('run');
        }
      } else if (runHeldByActionRef.current) {
        runHeldByActionRef.current = false;
        onPressOut('run');
      }
    },
    [hapticsEnabled, hapticIntensity, onPressIn, onPressOut, runMode],
  );

  useEffect(() => {
    if (runMode !== 'buttonHold' && runHeldByActionRef.current) {
      runHeldByActionRef.current = false;
      onPressOut('run');
    }
  }, [runMode, onPressOut]);

  const updateButtonAnimsWorklet = (nextMask: number, prevMask: number) => {
    'worklet';
    const scales = [b0.scale, b1.scale, b2.scale, b3.scale];
    const presseds = [b0.pressed, b1.pressed, b2.pressed, b3.pressed];
    for (let i = 0; i < 4; i++) {
      const bit = 1 << i;
      const wasDown = (prevMask & bit) !== 0;
      const isDown = (nextMask & bit) !== 0;
      if (!wasDown && isDown) {
        scales[i].value = withSpring(0.84, { damping: 18, stiffness: 520 });
        presseds[i].value = withTiming(1, { duration: 25 });
      } else if (wasDown && !isDown) {
        scales[i].value = withSpring(1, { damping: 14, stiffness: 340 });
        presseds[i].value = withTiming(0, { duration: 120 });
      }
    }
  };

  const recomputeMaskWorklet = () => {
    'worklet';
    let nextMask = 0;
    const masks = touchMasks.value;
    const ids = touchIds.value;
    for (let i = 0; i < 8; i++) {
      if (ids[i] !== -1) {
        nextMask |= masks[i];
      }
    }
    const prevMask = currentMask.value;
    if (nextMask !== prevMask) {
      currentMask.value = nextMask;
      updateButtonAnimsWorklet(nextMask, prevMask);
      runOnJS(applyMaskChange)(nextMask, prevMask);
    }
  };

  const gesture = Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      const cx = clusterCenterX.value > 0 ? clusterCenterX.value : layoutW.value / 2;
      const cy = clusterCenterY.value > 0 ? clusterCenterY.value : layoutH.value / 2;
      const maxR = clusterMaxRadius.value;
      const ids = [...touchIds.value];
      const masks = [...touchMasks.value];

      for (const t of e.changedTouches) {
        const mask = getButtonMask(t.x, t.y, cx, cy, sepX, sepY, maxR);
        if (mask === 0) continue;
        let slot = ids.indexOf(t.id);
        if (slot === -1) slot = ids.indexOf(-1);
        if (slot !== -1) {
          ids[slot] = t.id;
          masks[slot] = mask;
        }
      }
      touchIds.value = ids;
      touchMasks.value = masks;
      recomputeMaskWorklet();
    })
    .onTouchesMove((e) => {
      'worklet';
      const cx = clusterCenterX.value > 0 ? clusterCenterX.value : layoutW.value / 2;
      const cy = clusterCenterY.value > 0 ? clusterCenterY.value : layoutH.value / 2;
      const maxR = clusterMaxRadius.value;
      const ids = touchIds.value;
      let changed = false;
      let nextMasks: number[] | null = null;

      for (const t of e.changedTouches) {
        const slot = ids.indexOf(t.id);
        if (slot === -1) continue;
        const mask = getButtonMask(t.x, t.y, cx, cy, sepX, sepY, maxR);
        const cur = (nextMasks ?? touchMasks.value)[slot];
        if (mask !== cur) {
          if (!nextMasks) nextMasks = [...touchMasks.value];
          nextMasks[slot] = mask;
          changed = true;
        }
      }
      if (changed && nextMasks) {
        touchMasks.value = nextMasks;
        recomputeMaskWorklet();
      }
    })
    .onTouchesUp((e) => {
      'worklet';
      const ids = [...touchIds.value];
      const masks = [...touchMasks.value];
      let changed = false;
      for (const t of e.changedTouches) {
        const slot = ids.indexOf(t.id);
        if (slot !== -1) {
          ids[slot] = -1;
          masks[slot] = 0;
          changed = true;
        }
      }
      if (changed) {
        touchIds.value = ids;
        touchMasks.value = masks;
        recomputeMaskWorklet();
      }
    })
    .onTouchesCancelled((e) => {
      'worklet';
      const ids = [...touchIds.value];
      const masks = [...touchMasks.value];
      let changed = false;
      for (const t of e.changedTouches) {
        const slot = ids.indexOf(t.id);
        if (slot !== -1) {
          ids[slot] = -1;
          masks[slot] = 0;
          changed = true;
        }
      }
      if (changed) {
        touchIds.value = ids;
        touchMasks.value = masks;
        recomputeMaskWorklet();
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
      {/* Single gesture zone: UI-thread chording + slide rollover */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Visual diamond anchored in the ergonomic thumb arc */}
      <View
        style={[
          styles.visualLayer,
          compact ? styles.visualLayerCompact : styles.visualLayerRegular,
          compact
            ? styles.visualLayerCenter
            : mirrored
              ? styles.visualLayerMirrored
              : styles.visualLayerStandard,
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.diamondCluster, { gap: btnGap }]}
          pointerEvents="none"
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            clusterCenterX.value = x + width / 2;
            clusterCenterY.value = y + height / 2;
            clusterMaxRadius.value = Math.max(width, height) * 0.95;
          }}
        >
          <ButtonVisual config={BUTTONS[0]} scale={b0.scale} pressed={b0.pressed} size={btnSize} />
          <View style={[styles.diamondMidRow, { gap: midGap }]}>
            <ButtonVisual config={BUTTONS[1]} scale={b1.scale} pressed={b1.pressed} size={btnSize} />
            <ButtonVisual config={BUTTONS[2]} scale={b2.scale} pressed={b2.pressed} size={btnSize} />
          </View>
          <ButtonVisual config={BUTTONS[3]} scale={b3.scale} pressed={b3.pressed} size={btnSize} />
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
  },
  visualLayerRegular: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  visualLayerCompact: {
    paddingHorizontal: 6,
    paddingBottom: 32,
  },
  visualLayerStandard: {
    alignItems: 'flex-end',
  },
  visualLayerMirrored: {
    alignItems: 'flex-start',
  },
  visualLayerCenter: {
    alignItems: 'center',
  },
  diamondCluster: {
    alignItems: 'center',
  },
  diamondMidRow: {
    flexDirection: 'row',
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
