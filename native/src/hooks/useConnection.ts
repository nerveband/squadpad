import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ConnectionManager, ConnectionStatus } from '../connection/connection-manager';

interface UseConnectionOptions {
  connectionManager: ConnectionManager;
  autoReconnect?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface UseConnectionResult {
  status: ConnectionStatus;
  lagMs: number | null;
  error: string | null;
  reconnectAttempt: number;
}

export function useConnection({
  connectionManager,
  autoReconnect = true,
  maxRetries = 5,
  retryDelayMs = 2000,
}: UseConnectionOptions): UseConnectionResult {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lagMs, setLagMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wasConnectedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to app state changes
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && wasConnectedRef.current) {
        // App came back to foreground, reconnect
        setStatus('reconnecting');
        // Reconnect will be handled by the connection manager
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // Track connection status
  useEffect(() => {
    if (status === 'connected') {
      wasConnectedRef.current = true;
      setReconnectAttempt(0);
      setError(null);
    }
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  return {
    status,
    lagMs,
    error,
    reconnectAttempt,
  };
}
