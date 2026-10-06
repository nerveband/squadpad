import { useRef, useState, useEffect, useCallback } from 'react';
import { ControllerState, type ButtonName } from '../controller/controller-state';
import { ConnectionManager } from '../connection/connection-manager';

const KEEPALIVE_INTERVAL = 1000;

interface UseControllerOptions {
  connectionManager: ConnectionManager;
}

export function useController({ connectionManager }: UseControllerOptions) {
  const controllerRef = useRef(new ControllerState());
  const [lagMs, setLagMs] = useState<number | null>(null);
  const lagBufferRef = useRef<number[]>([]);
  const lagTimerRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectTime, setConnectTime] = useState('0:00');
  const connectStartRef = useRef<number | null>(null);

  // Send state on change
  useEffect(() => {
    const controller = controllerRef.current;
    controller.onChange = (state) => connectionManager.sendState(state);
    return () => {
      controller.onChange = null;
    };
  }, [connectionManager]);

  // Keepalive: input changes are sent immediately; while idle, repeat the
  // current state once a second so the host keeps the player and acks keep
  // flowing (the LAN watchdog treats 6 s of silence as a lost connection).
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionManager.status.kind === 'connected') {
        connectionManager.sendState(controllerRef.current.getState());
      }
    }, KEEPALIVE_INTERVAL);
    return () => clearInterval(interval);
  }, [connectionManager]);

  // Smooth lag display — average over last 5 samples, update UI at most every 500ms
  useEffect(() => {
    lagTimerRef.current = setInterval(() => {
      const buf = lagBufferRef.current;
      if (buf.length > 0) {
        const avg = Math.round(buf.reduce((a, b) => a + b, 0) / buf.length);
        setLagMs(avg);
        lagBufferRef.current = [];
      }
    }, 500);
    return () => {
      if (lagTimerRef.current) clearInterval(lagTimerRef.current);
    };
  }, []);

  // Connect timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectStartRef.current) {
        const elapsed = Math.floor((Date.now() - connectStartRef.current) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        setConnectTime(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const setJoystick = useCallback((x: number, y: number) => {
    controllerRef.current.setJoystick(x, y);
  }, []);

  const pressButton = useCallback((name: ButtonName) => {
    controllerRef.current.pressButton(name);
  }, []);

  const releaseButton = useCallback((name: ButtonName) => {
    controllerRef.current.releaseButton(name);
  }, []);

  const markConnected = useCallback(() => {
    setConnected(true);
    connectStartRef.current = Date.now();
  }, []);

  const markDisconnected = useCallback(() => {
    setConnected(false);
    connectStartRef.current = null;
    setConnectTime('0:00');
    lagBufferRef.current = [];
    setLagMs(null);
  }, []);

  // Buffer raw lag samples — smoothed display updates every 500ms
  const pushLag = useCallback((ms: number) => {
    lagBufferRef.current.push(ms);
    // Keep buffer from growing unbounded
    if (lagBufferRef.current.length > 20) {
      lagBufferRef.current = lagBufferRef.current.slice(-10);
    }
  }, []);

  return {
    setJoystick,
    pressButton,
    releaseButton,
    lagMs,
    pushLag,
    connected,
    connectTime,
    markConnected,
    markDisconnected,
  };
}
