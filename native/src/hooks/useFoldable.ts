import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { useReservedRegions, type ReservedRegion } from 'react-native-reserved-regions';
import { useHinge, type Hinge } from 'expo-hinge';

export type FoldablePosture = 'flat' | 'book' | 'tabletop';

export interface FoldDivision {
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: 'vertical' | 'horizontal';
  occludesContent: boolean;
}

export interface FoldableLayout {
  width: number;
  height: number;
  insets: EdgeInsets;
  safeWidth: number;
  safeHeight: number;
  isPortrait: boolean;
  /** True when horizontal safe width fits a two-column layout (unfolded Duo, Android foldable, tablet). */
  isWide: boolean;
  /** Active physical fold division reported by iOS 27.1 ReservedRegions or Android WindowManager. */
  fold: FoldDivision | null;
  /** Camera or cutout occlusion rectangles inside the view. */
  occlusions: { x: number; y: number; width: number; height: number }[];
  /** Live hinge state from UIHingeInteraction (iOS 27.1) or Jetpack WindowManager / hinge sensor (Android). */
  hinge: Hinge | null;
  /** Physical posture derived from fold geometry, hinge state, and aspect ratio. */
  posture: FoldablePosture;
  /** True when the controller should use the upper half for status and the lower half for touch controls. */
  isTabletopController: boolean;
}

function useSafeRegions(): readonly ReservedRegion[] {
  try {
    return useReservedRegions();
  } catch {
    return [];
  }
}
function useSafeHinge(): Hinge | null {
  try {
    return useHinge();
  } catch {
    return null;
  }
}

export function useFoldable(): FoldableLayout {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const regions = useSafeRegions();
  const hinge = useSafeHinge();

  const safeWidth = Math.max(0, width - insets.left - insets.right);
  const safeHeight = Math.max(0, height - insets.top - insets.bottom);
  const isPortrait = height > width;

  const divisionRegion = regions.find(
    (r): r is Extract<ReservedRegion, { kind: 'division' }> => r.kind === 'division',
  );

  const fold: FoldDivision | null = divisionRegion
    ? {
        x: divisionRegion.frame.x,
        y: divisionRegion.frame.y,
        width: divisionRegion.frame.width,
        height: divisionRegion.frame.height,
        orientation:
          divisionRegion.frame.width >= divisionRegion.frame.height ? 'horizontal' : 'vertical',
        occludesContent: divisionRegion.occludesContent,
      }
    : null;

  const occlusions = regions
    .filter((r): r is Extract<ReservedRegion, { kind: 'occlusion' }> => r.kind === 'occlusion')
    .map((r) => r.frame);

  const partiallyOpen = hinge?.status === 'partiallyOpen';

  let posture: FoldablePosture = 'flat';
  if (fold) {
    posture = fold.orientation === 'horizontal' ? 'tabletop' : 'book';
  } else if (partiallyOpen) {
    posture = isPortrait ? 'tabletop' : 'book';
  }

  // Unfolded iPhone Duo in landscape has safeWidth = 867 pt (951 - 84 vertical bar).
  // Android foldables unfolded have safeWidth ~673-841 dp.
  // Outer iPhone Duo has safeWidth = 382 pt (portrait) or 594 pt (landscape).
  const isWide = safeWidth >= 660 || posture === 'book';

  // Use tabletop controller layout when in tabletop posture, or in portrait on an
  // unfolded foldable / tablet (safeWidth >= 560).
  const isTabletopController =
    posture === 'tabletop' || (isPortrait && safeWidth >= 560 && safeHeight >= 560);

  return {
    width,
    height,
    insets,
    safeWidth,
    safeHeight,
    isPortrait,
    isWide,
    fold,
    occlusions,
    hinge,
    posture,
    isTabletopController,
  };
}
