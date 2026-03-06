import * as Haptics from 'expo-haptics';

type HapticIntensity = 'low' | 'medium' | 'high';

const INTENSITY_MAP: Record<HapticIntensity, Haptics.ImpactFeedbackStyle> = {
  low: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  high: Haptics.ImpactFeedbackStyle.Heavy,
};

interface ActionPattern {
  style: Haptics.ImpactFeedbackStyle;
  count: number;
  delayMs: number;
}

const ACTION_PATTERNS: Record<string, ActionPattern> = {
  punch: { style: Haptics.ImpactFeedbackStyle.Heavy, count: 1, delayMs: 0 },
  bomb:  { style: Haptics.ImpactFeedbackStyle.Medium, count: 1, delayMs: 0 },
  jump:  { style: Haptics.ImpactFeedbackStyle.Light, count: 1, delayMs: 0 },
  throw: { style: Haptics.ImpactFeedbackStyle.Medium, count: 2, delayMs: 50 },
  run:   { style: Haptics.ImpactFeedbackStyle.Light, count: 1, delayMs: 0 },
};

export function playHaptic(action: string, enabled: boolean, intensity: HapticIntensity = 'medium') {
  if (!enabled) return;

  const pattern = ACTION_PATTERNS[action];
  if (!pattern) return;

  // Adjust style based on user intensity preference
  const style = intensity === 'low'
    ? Haptics.ImpactFeedbackStyle.Light
    : intensity === 'high'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : pattern.style;

  Haptics.impactAsync(style);

  // Multi-tap patterns (e.g., throw)
  if (pattern.count > 1 && pattern.delayMs > 0) {
    for (let i = 1; i < pattern.count; i++) {
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, pattern.delayMs * i);
    }
  }
}
