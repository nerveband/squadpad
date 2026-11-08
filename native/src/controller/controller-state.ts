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

const ACTION_FLAGS = BTN.THROW | BTN.PUNCH | BTN.BOMB | BTN.JUMP;

export class ControllerState {
  private touchButtons = 0;
  private gamepadButtons = 0;
  private explicitButtons = 0;
  private joyX = 0;
  private joyY = 0;
  private gamepadJoyX = 0;
  private gamepadJoyY = 0;
  private stickRun = false;
  private actionRun = false;
  private gamepadRun = false;
  private explicitRun = false;
  /** Last state handed to onChange, as `buttons,h,v`. */
  private lastEmitted = '';
  onChange: ((state: InputState) => void) | null = null;

  getState(): InputState {
    let buttons =
      (this.touchButtons & ACTION_FLAGS) |
      (this.gamepadButtons & ACTION_FLAGS) |
      (this.explicitButtons & ~BTN.RUN);
    if (this.stickRun || this.actionRun || this.gamepadRun || this.explicitRun) {
      buttons |= BTN.RUN;
    }
    // Pick whichever joystick source has larger deflection so an idle gamepad
    // never zeroes out active touch movement (and vice versa).
    const touchMag = this.joyX * this.joyX + this.joyY * this.joyY;
    const padMag = this.gamepadJoyX * this.gamepadJoyX + this.gamepadJoyY * this.gamepadJoyY;
    const activeX = padMag > touchMag ? this.gamepadJoyX : this.joyX;
    const activeY = padMag > touchMag ? this.gamepadJoyY : this.joyY;
    return {
      buttons,
      h: Math.round((activeX + 1) * 127.5),
      v: Math.round((activeY + 1) * 127.5),
    };
  }

  setJoystick(x: number, y: number, rimRun?: boolean) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
    if (rimRun !== undefined) {
      this.stickRun = rimRun;
    }
    this._notify();
  }

  /**
   * Atomically update the 4 diamond action buttons from a 4-bit mask:
   * bit 0 = throw, bit 1 = punch, bit 2 = bomb, bit 3 = jump.
   */
  setActionMask(mask: number, holdRun = false) {
    let next = 0;
    if (mask & (1 << 0)) next |= BTN.THROW;
    if (mask & (1 << 1)) next |= BTN.PUNCH;
    if (mask & (1 << 2)) next |= BTN.BOMB;
    if (mask & (1 << 3)) next |= BTN.JUMP;
    this.touchButtons = next;
    this.actionRun = holdRun && mask !== 0;
    this._notify();
  }

  /**
   * Atomically update physical gamepad stick, 4-bit action mask, and trigger run
   * without clobbering active touch input.
   */
  setGamepadInput(x: number, y: number, mask: number, triggerRun = false) {
    this.gamepadJoyX = Math.max(-1, Math.min(1, x));
    this.gamepadJoyY = Math.max(-1, Math.min(1, y));
    let next = 0;
    if (mask & (1 << 0)) next |= BTN.THROW;
    if (mask & (1 << 1)) next |= BTN.PUNCH;
    if (mask & (1 << 2)) next |= BTN.BOMB;
    if (mask & (1 << 3)) next |= BTN.JUMP;
    this.gamepadButtons = next;
    this.gamepadRun = triggerRun;
    this._notify();
  }

  clearGamepad() {
    this.gamepadJoyX = 0;
    this.gamepadJoyY = 0;
    this.gamepadButtons = 0;
    this.gamepadRun = false;
    this._notify();
  }

  pressButton(name: ButtonName) {
    if (name === 'run') {
      this.explicitRun = true;
      this._notify();
      return;
    }
    const flag = BUTTON_MAP[name];
    if (!flag) return;
    if (flag & ACTION_FLAGS) {
      this.touchButtons |= flag;
    } else {
      this.explicitButtons |= flag;
    }
    this._notify();
  }

  releaseButton(name: ButtonName) {
    if (name === 'run') {
      this.explicitRun = false;
      this._notify();
      return;
    }
    const flag = BUTTON_MAP[name];
    if (!flag) return;
    if (flag & ACTION_FLAGS) {
      this.touchButtons &= ~flag;
    } else {
      this.explicitButtons &= ~flag;
    }
    this._notify();
  }

  /**
   * Explicit transition back to neutral. Always emits, even when the cached
   * state already reads neutral, because the host may still believe a button or
   * stick is held (for example after the app was backgrounded and no touch-up
   * ever arrived).
   */
  reset() {
    this.touchButtons = 0;
    this.gamepadButtons = 0;
    this.explicitButtons = 0;
    this.joyX = 0;
    this.joyY = 0;
    this.gamepadJoyX = 0;
    this.gamepadJoyY = 0;
    this.stickRun = false;
    this.actionRun = false;
    this.gamepadRun = false;
    this.explicitRun = false;
    this.lastEmitted = '';
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
