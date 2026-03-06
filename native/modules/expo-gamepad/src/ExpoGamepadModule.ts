import { requireNativeModule, EventEmitter } from 'expo-modules-core';

interface ControllerInfo {
  id: string;
  name: string;
  vendorName: string;
}

interface GamepadInputEvent {
  leftStickX: number;
  leftStickY: number;
  buttonA: boolean;
  buttonB: boolean;
  buttonX: boolean;
  buttonY: boolean;
  leftTrigger: number;
  rightTrigger: number;
}

const ExpoGamepadNative = requireNativeModule<{
  getConnectedControllers(): ControllerInfo[];
}>('ExpoGamepad');

// @ts-expect-error - EventEmitter typing
const emitter = new EventEmitter(ExpoGamepadNative);

export const GamepadManager = {
  getConnectedControllers(): ControllerInfo[] {
    return ExpoGamepadNative.getConnectedControllers();
  },

  onControllerConnected(callback: (controller: ControllerInfo) => void) {
    // @ts-expect-error - event name typing
    return emitter.addListener('onControllerConnected', callback);
  },

  onControllerDisconnected(callback: (controllerId: string) => void) {
    // @ts-expect-error - event name typing
    return emitter.addListener('onControllerDisconnected', (event: { id: string }) => {
      callback(event.id);
    });
  },

  onInput(callback: (event: GamepadInputEvent) => void) {
    // @ts-expect-error - event name typing
    return emitter.addListener('onGamepadInput', callback);
  },
};
