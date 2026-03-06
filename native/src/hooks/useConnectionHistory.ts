import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'connection_history';
const MAX_ENTRIES = 5;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface HistoryEntry {
  roomCode: string;
  timestamp: number;
}

export function useConnectionHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const entries: HistoryEntry[] = JSON.parse(raw);
      const now = Date.now();
      const valid = entries
        .filter((e) => now - e.timestamp < EXPIRY_MS)
        .slice(0, MAX_ENTRIES);
      setHistory(valid.map((e) => e.roomCode));
    } catch {
      // Ignore storage errors
    }
  };

  const addToHistory = useCallback(async (roomCode: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let entries: HistoryEntry[] = raw ? JSON.parse(raw) : [];

      // Remove duplicate
      entries = entries.filter((e) => e.roomCode !== roomCode);

      // Add to front
      entries.unshift({ roomCode, timestamp: Date.now() });

      // Trim
      entries = entries.slice(0, MAX_ENTRIES);

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      setHistory(entries.map((e) => e.roomCode));
    } catch {
      // Ignore storage errors
    }
  }, []);

  return { history, addToHistory };
}
