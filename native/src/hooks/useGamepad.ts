import { useState, useEffect, useRef } from 'react';
import { GamepadManager } from '../../modules/expo-gamepad';
import { ControllerState } from '../controller/controller-state';

interface GamepadState {
  connected: boolean;
  controllerName: string | null;
}

// Maps physical gamepad buttons to BombSquad actions
function mapGamepadInput(event: {
  leftStickX: number;
  leftStickY: number;
  buttonA: boolean;
  buttonB: boolean;
  buttonX: boolean;
  buttonY: boolean;
}, controller: ControllerState) {
  controller.setJoystick(event.leftStickX, event.leftStickY);

  // A = Jump, B = Bomb, X = Punch, Y = Throw
  if (event.buttonA) controller.pressButton('jump');
  else controller.releaseButton('jump');

  if (event.buttonB) controller.pressButton('bomb');
  else controller.releaseButton('bomb');

  if (event.buttonX) controller.pressButton('punch');
  else controller.releaseButton('punch');

  if (event.buttonY) controller.pressButton('throw');
  else controller.releaseButton('throw');
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
