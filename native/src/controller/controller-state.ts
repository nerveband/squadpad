import { BTN } from '../protocol/constants';

export interface InputState {
  buttons: number;
  h: number;
  v: number;
}

type ButtonName = 'menu' | 'jump' | 'punch' | 'throw' | 'bomb' | 'run';

const BUTTON_MAP: Record<ButtonName, number> = {
  menu:  BTN.MENU,
  jump:  BTN.JUMP,
  punch: BTN.PUNCH,
  throw: BTN.THROW,
  bomb:  BTN.BOMB,
  run:   BTN.RUN,
};

export class ControllerState {
  private buttons = 0;
  private joyX = 0;
  private joyY = 0;
  onChange: ((state: InputState) => void) | null = null;

  getState(): InputState {
    return {
      buttons: this.buttons,
      h: Math.round((this.joyX + 1) * 127.5),
      v: Math.round((this.joyY + 1) * 127.5),
    };
  }

  setJoystick(x: number, y: number) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
    this._notify();
  }

  pressButton(name: ButtonName) {
    const flag = BUTTON_MAP[name];
    if (flag && !(this.buttons & flag)) {
      this.buttons |= flag;
      this._notify();
    }
  }

  releaseButton(name: ButtonName) {
    const flag = BUTTON_MAP[name];
    if (flag && (this.buttons & flag)) {
      this.buttons &= ~flag;
      this._notify();
    }
  }

  reset() {
    this.buttons = 0;
    this.joyX = 0;
    this.joyY = 0;
    this._notify();
  }

  private _notify() {
    if (this.onChange) this.onChange(this.getState());
  }
}
