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
  private buttons = 0;
  private joyX = 0;
  private joyY = 0;
  private stickRun = false;
  private actionRun = false;
  private explicitRun = false;
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

  private syncRunBit() {
    if (this.stickRun || this.actionRun || this.explicitRun) {
      this.buttons |= BTN.RUN;
    } else {
      this.buttons &= ~BTN.RUN;
    }
  }

  setJoystick(x: number, y: number, rimRun?: boolean) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
    if (rimRun !== undefined) {
      this.stickRun = rimRun;
      this.syncRunBit();
    }
    this._notify();
  }

  /**
   * Atomically update the 4 diamond action buttons from a 4-bit mask:
   * bit 0 = throw, bit 1 = punch, bit 2 = bomb, bit 3 = jump.
   */
  setActionMask(mask: number, holdRun = false) {
    let next = this.buttons & ~ACTION_FLAGS;
    if (mask & (1 << 0)) next |= BTN.THROW;
    if (mask & (1 << 1)) next |= BTN.PUNCH;
    if (mask & (1 << 2)) next |= BTN.BOMB;
    if (mask & (1 << 3)) next |= BTN.JUMP;
    this.buttons = next;
    this.actionRun = holdRun && mask !== 0;
    this.syncRunBit();
    this._notify();
  }

  pressButton(name: ButtonName) {
    if (name === 'run') {
      this.explicitRun = true;
      this.syncRunBit();
      this._notify();
      return;
    }
    const flag = BUTTON_MAP[name];
    if (flag && !(this.buttons & flag)) {
      this.buttons |= flag;
      this._notify();
    }
  }

  releaseButton(name: ButtonName) {
    if (name === 'run') {
      this.explicitRun = false;
      this.syncRunBit();
      this._notify();
      return;
    }
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
    this.stickRun = false;
    this.actionRun = false;
    this.explicitRun = false;
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
