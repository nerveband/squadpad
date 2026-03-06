import { useState, useEffect, useRef } from 'react';
import { Discovery, DiscoveredGame } from '../connection/discovery';

export function useDiscovery() {
  const [games, setGames] = useState<DiscoveredGame[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discoveryRef = useRef<Discovery | null>(null);

  useEffect(() => {
    const discovery = new Discovery((found) => {
      setGames([...found]);
    });
    discoveryRef.current = discovery;
    setScanning(true);

    discovery.start().then(() => {
      console.log('[Discovery] Started scanning on port', 43210);
    }).catch((err) => {
      console.error('[Discovery] Failed to start:', err);
      setError(`Discovery failed: ${err?.message || String(err)}`);
      setScanning(false);
    });

    return () => {
      discovery.stop();
      setScanning(false);
    };
  }, []);

  return { games, scanning, error };
}
