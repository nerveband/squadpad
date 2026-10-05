import { NativeModule, requireNativeModule } from 'expo-modules-core';

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

type ExpoGamepadEvents = {
  onControllerConnected(controller: ControllerInfo): void;
  onControllerDisconnected(event: { id: string }): void;
  onGamepadInput(event: GamepadInputEvent): void;
};

declare class ExpoGamepadNativeModule extends NativeModule<ExpoGamepadEvents> {
  getConnectedControllers(): ControllerInfo[];
}

const ExpoGamepadNative = requireNativeModule<ExpoGamepadNativeModule>('ExpoGamepad');

export const GamepadManager = {
  getConnectedControllers(): ControllerInfo[] {
    return ExpoGamepadNative.getConnectedControllers();
  },

  onControllerConnected(callback: (controller: ControllerInfo) => void) {
    return ExpoGamepadNative.addListener('onControllerConnected', callback);
  },

  onControllerDisconnected(callback: (controllerId: string) => void) {
    return ExpoGamepadNative.addListener('onControllerDisconnected', (event) => callback(event.id));
  },

  onInput(callback: (event: GamepadInputEvent) => void) {
    return ExpoGamepadNative.addListener('onGamepadInput', callback);
  },
};
