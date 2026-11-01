import { useState, useEffect } from 'react';
import { GamepadManager } from '../../modules/expo-gamepad';
import { ControllerState } from '../controller/controller-state';

interface GamepadState {
  connected: boolean;
  controllerName: string | null;
}

// Maps physical gamepad buttons to BombSquad actions atomically without
// overwriting touch input.
function mapGamepadInput(
  event: {
    leftStickX: number;
    leftStickY: number;
    buttonA: boolean;
    buttonB: boolean;
    buttonX: boolean;
    buttonY: boolean;
    leftTrigger?: number;
    rightTrigger?: number;
  },
  controller: ControllerState,
) {
  let mask = 0;
  if (event.buttonY) mask |= 1 << 0; // throw
  if (event.buttonX) mask |= 1 << 1; // punch
  if (event.buttonB) mask |= 1 << 2; // bomb
  if (event.buttonA) mask |= 1 << 3; // jump
  const triggerRun = (event.leftTrigger ?? 0) > 0.25 || (event.rightTrigger ?? 0) > 0.25;
  controller.setGamepadInput(event.leftStickX, event.leftStickY, mask, triggerRun);
}
export function useGamepad(controller: ControllerState): GamepadState {
  const [state, setState] = useState<GamepadState>({
    connected: false,
    controllerName: null,
  });

  useEffect(() => {
    const connectSub = GamepadManager.onControllerConnected((info) => {
      setState({ connected: true, controllerName: info.name });
    });

    const disconnectSub = GamepadManager.onControllerDisconnected(() => {
      controller.clearGamepad();
      setState({ connected: false, controllerName: null });
    });
    const inputSub = GamepadManager.onInput((event) => {
      mapGamepadInput(event, controller);
    });

    // Check for already-connected controllers
    try {
      const existing = GamepadManager.getConnectedControllers();
      if (existing.length > 0) {
        setState({ connected: true, controllerName: existing[0].name });
      }
    } catch {
      // Module might not be available in Expo Go
    }

    return () => {
      connectSub.remove();
      disconnectSub.remove();
      inputSub.remove();
    };
  }, [controller]);

  return state;
}
