import { useRef, useState, useEffect, useCallback } from 'react';
import { ControllerState } from '../controller/controller-state';
import { ConnectionManager } from '../connection/connection-manager';

interface UseControllerOptions {
  connectionManager: ConnectionManager;
}

export function useController({ connectionManager }: UseControllerOptions) {
  const controllerRef = useRef(new ControllerState());
  const [lagMs, setLagMs] = useState<number | null>(null);
  const lagBufferRef = useRef<number[]>([]);
  const lagTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectTime, setConnectTime] = useState('0:00');
  const connectStartRef = useRef<number | null>(null);
  const debugCountRef = useRef(0);

  // Send state on change
  useEffect(() => {
    const controller = controllerRef.current;
    controller.onChange = (state) => {
      connectionManager.sendState(state);
      // Log every 20th state change to avoid spam
      debugCountRef.current++;
      if (debugCountRef.current % 20 === 1) {
        console.log(`[Controller] state: btns=0x${state.buttons.toString(16)} h=${state.h} v=${state.v}`);
      }
    };
    return () => {
      controller.onChange = null;
    };
  }, [connectionManager]);

  // Keepalive: resend current state every 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionManager.status === 'connected') {
        const state = controllerRef.current.getState();
        connectionManager.sendState(state);
      }
    }, 100);
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

  const pressButton = useCallback((name: string) => {
    console.log(`[Controller] press: ${name}`);
    controllerRef.current.pressButton(name as any);
  }, []);

  const releaseButton = useCallback((name: string) => {
    controllerRef.current.releaseButton(name as any);
  }, []);

  const markConnected = useCallback(() => {
    console.log('[Controller] Connected');
    setConnected(true);
    connectStartRef.current = Date.now();
  }, []);

  const markDisconnected = useCallback(() => {
    console.log('[Controller] Disconnected');
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
