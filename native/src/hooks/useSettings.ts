import type { HapticIntensity } from '../controller/haptics';
import type { JoystickStyle } from '../components/Joystick';
import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  playerName: string;
  hapticsEnabled: boolean;
  hapticIntensity: HapticIntensity;
  joystickStyle: JoystickStyle;
  sensitivity: number; // 0.5 to 2.0
  allowPortrait: boolean;
  relayUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: '',
  hapticsEnabled: true,
  hapticIntensity: 'medium',
  joystickStyle: 'floating',
  sensitivity: 1.0,
  allowPortrait: true,
  relayUrl: 'wss://squadpad-relay.fly.dev',
};

const STORAGE_KEY = 'squadpad_settings';

// One store shared by every screen, so a change made in Settings reaches a
// controller screen that is already mounted underneath it.
let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw) {
      try {
        current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {
        // Ignore corrupt storage
      }
    }
  })
  .finally(() => {
    loaded = true;
    emit();
  });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, () => current);
  const isLoaded = useSyncExternalStore(subscribe, () => loaded);

  const update = useCallback((partial: Partial<Settings>) => {
    current = { ...current, ...partial };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
    emit();
  }, []);

  return { settings, update, loaded: isLoaded };
}
