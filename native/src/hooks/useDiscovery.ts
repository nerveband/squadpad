import { useState, useEffect } from 'react';
import { Discovery, DiscoveredGame } from '../connection/discovery';

/** Scans the LAN for BombSquad hosts while `enabled` (the home screen is focused). */
export function useDiscovery(enabled: boolean) {
  const [games, setGames] = useState<DiscoveredGame[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const discovery = new Discovery((found) => setGames([...found]));
    setError(null);
    setScanning(true);

    discovery.start().catch((err) => {
      console.error('[Discovery] Failed to start:', err);
      setError(`Discovery failed: ${err?.message || String(err)}`);
      setScanning(false);
    });

    return () => {
      discovery.stop();
      setScanning(false);
      setGames([]);
    };
  }, [enabled]);

  return { games, scanning, error };
}
