import { BTN } from '../protocol/constants';

export interface InputState {
  buttons: number;
  h: number;
  v: number;
}

export type ButtonName = 'menu' | 'jump' | 'punch' | 'throw' | 'bomb' | 'run';

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
  /** Last state handed to onChange, as `buttons,h,v`. */
  private lastEmitted = '';
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

  // Touch moves arrive at 60-120 Hz but the wire format has 256 steps per axis,
  // and a thumb in the dead zone or pinned at the rim repeats the same value.
  // Only emit real changes; the 1 s keepalive re-sends the current state anyway.
  private _notify() {
    const state = this.getState();
    const key = `${state.buttons},${state.h},${state.v}`;
    if (key === this.lastEmitted) return;
    this.lastEmitted = key;
    if (this.onChange) this.onChange(state);
  }
}
