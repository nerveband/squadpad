import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  playerName: string;
  hapticsEnabled: boolean;
  hapticIntensity: 'low' | 'medium' | 'high';
  joystickStyle: 'floating' | 'fixed';
  buttonSize: 'small' | 'medium' | 'large';
  sensitivity: number; // 0.5 to 2.0
  allowPortrait: boolean;
  relayUrl: string;
}

const DEFAULTS: Settings = {
  playerName: '',
  hapticsEnabled: true,
  hapticIntensity: 'medium',
  joystickStyle: 'floating',
  buttonSize: 'medium',
  sensitivity: 1.0,
  allowPortrait: true,
  relayUrl: 'wss://squadpad-relay.fly.dev',
};

const STORAGE_KEY = 'squadpad_settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch {
          // Ignore corrupt storage
        }
      }
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, update, loaded };
}
